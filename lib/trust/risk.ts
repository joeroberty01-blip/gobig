import { prisma } from "@/lib/db";
import { Prisma, type RiskKind, type RiskSeverity } from "@/generated/prisma/client";

// Automation Engine, Phase F: trust & safety. Each detector counts something unusual and raises a
// flag for an admin. Nothing here bans, hides, unpublishes or changes anything else (owner's rule:
// flag only). Details are counts and ids, never message text or contact details.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LIMIT = 200;

export type Finding = { kind: RiskKind; subjectType: "PROVIDER" | "USER"; subjectId: string; count: number; threshold: number; window: string; extra?: Record<string, number | string> };

/** Twice the threshold or more is HIGH; reaching it is MEDIUM. Expiry warnings are LOW. */
export function severityFor(f: Pick<Finding, "kind" | "count" | "threshold">): RiskSeverity {
  if (f.kind === "VERIFICATION_EXPIRING") return "LOW";
  if (f.kind === "VERIFICATION_EXPIRED") return "MEDIUM";
  return f.count >= f.threshold * 2 ? "HIGH" : "MEDIUM";
}

/**
 * Stores findings as flags, once per (kind, subject, window). Returns how many are new. A flag an
 * admin already dismissed for the same window is not raised again.
 */
export async function raiseFlags(findings: Finding[]): Promise<number> {
  if (!findings.length) return 0;
  const r = await prisma.riskFlag.createMany({
    data: findings.map((f) => ({
      kind: f.kind,
      severity: severityFor(f),
      subjectType: f.subjectType,
      subjectId: f.subjectId,
      details: { count: f.count, threshold: f.threshold, window: f.window, ...f.extra } as Prisma.InputJsonValue,
      dedupeKey: `${f.kind}:${f.subjectType}:${f.subjectId}:${f.window}`,
    })),
    skipDuplicates: true,
  });
  return r.count;
}

const day = (now: Date) => new Date(now.getTime() + 3 * HOUR).toISOString().slice(0, 10); // Dar date

/** Many reviews for one business in a short time. */
export async function reviewBursts(count: number, hours: number, now: Date): Promise<Finding[]> {
  const rows = await prisma.review.groupBy({
    by: ["providerId"],
    // Sample businesses (seeded reviews) are not real activity.
    where: { createdAt: { gt: new Date(now.getTime() - hours * HOUR) }, provider: { isDemo: false } },
    _count: { _all: true },
    having: { providerId: { _count: { gte: count } } },
    orderBy: { _count: { providerId: "desc" } },
    take: LIMIT,
  });
  return rows.map((r) => ({ kind: "REVIEW_BURST", subjectType: "PROVIDER", subjectId: r.providerId, count: r._count._all, threshold: count, window: day(now), extra: { hours } }));
}

/** Several reviews for one business from accounts created shortly before reviewing. */
export async function newAccountReviews(count: number, accountDays: number, now: Date): Promise<Finding[]> {
  const rows = await prisma.$queryRaw<{ providerId: string; n: bigint }[]>`
    SELECT r."providerId", COUNT(*)::bigint AS n
    FROM "Review" r JOIN "User" u ON u.id = r."authorId" JOIN "Provider" p ON p.id = r."providerId" AND p."isDemo" = false
    WHERE r."createdAt" > ${new Date(now.getTime() - 7 * DAY)}
      AND r."createdAt" - u."createdAt" < ${`${accountDays} days`}::interval
    GROUP BY r."providerId" HAVING COUNT(*) >= ${count}
    LIMIT ${LIMIT}`;
  return rows.map((r) => ({ kind: "NEW_ACCOUNT_REVIEWS", subjectType: "PROVIDER", subjectId: r.providerId, count: Number(r.n), threshold: count, window: day(now), extra: { accountDays } }));
}

/** One account posting many requests in a day. */
export async function requestSpam(count: number, now: Date): Promise<Finding[]> {
  const rows = await prisma.serviceRequest.groupBy({
    by: ["customerId"],
    where: { createdAt: { gt: new Date(now.getTime() - DAY) } },
    _count: { _all: true },
    having: { customerId: { _count: { gte: count } } },
    orderBy: { _count: { customerId: "desc" } },
    take: LIMIT,
  });
  return rows.map((r) => ({ kind: "REQUEST_SPAM", subjectType: "USER", subjectId: r.customerId, count: r._count._all, threshold: count, window: day(now) }));
}

/** One account sending many messages in an hour. */
export async function messageSpam(count: number, now: Date): Promise<Finding[]> {
  const rows = await prisma.message.groupBy({
    by: ["senderId"],
    where: { createdAt: { gt: new Date(now.getTime() - HOUR) } },
    _count: { _all: true },
    having: { senderId: { _count: { gte: count } } },
    orderBy: { _count: { senderId: "desc" } },
    take: LIMIT,
  });
  return rows.map((r) => ({ kind: "MESSAGE_SPAM", subjectType: "USER", subjectId: r.senderId, count: r._count._all, threshold: count, window: day(now) }));
}

/** Several different people reporting the same business (listing, request or chat) in 30 days. */
export async function repeatedReports(count: number, now: Date): Promise<Finding[]> {
  const rows = await prisma.$queryRaw<{ providerId: string; n: bigint }[]>`
    SELECT rp."providerId", COUNT(DISTINCT rp."reporterId")::bigint AS n
    FROM "Report" rp JOIN "Provider" p ON p.id = rp."providerId" AND p."isDemo" = false
    WHERE rp."createdAt" > ${new Date(now.getTime() - 30 * DAY)}
    GROUP BY rp."providerId" HAVING COUNT(DISTINCT rp."reporterId") >= ${count}
    LIMIT ${LIMIT}`;
  return rows.map((r) => ({ kind: "REPEATED_REPORTS", subjectType: "PROVIDER", subjectId: r.providerId, count: Number(r.n), threshold: count, window: day(now) }));
}

/** A customer cancelling many trips in a day (drivers lose time and fuel). */
export async function tripCancellations(count: number, now: Date): Promise<Finding[]> {
  const rows = await prisma.trip.groupBy({
    by: ["customerId"],
    where: { cancelledBy: "CUSTOMER", cancelledAt: { gt: new Date(now.getTime() - DAY) } },
    _count: { _all: true },
    having: { customerId: { _count: { gte: count } } },
    orderBy: { _count: { customerId: "desc" } },
    take: LIMIT,
  });
  return rows.map((r) => ({ kind: "TRIP_CANCELLATIONS", subjectType: "USER", subjectId: r.customerId, count: r._count._all, threshold: count, window: day(now) }));
}

/** Verified businesses whose verification is about to pass `months` old, or already has. */
export async function verificationAges(months: number, warnDays: number, now: Date) {
  const expiry = (d: Date) => {
    const x = new Date(d);
    x.setUTCMonth(x.getUTCMonth() + months);
    return x;
  };
  const cutoffWarn = new Date(now.getTime() + warnDays * DAY);
  const rows = await prisma.provider.findMany({
    where: { verificationLevelId: { not: null }, verifiedAt: { not: null }, deletedAt: null, isDemo: false },
    select: { id: true, verifiedAt: true },
    take: 5000,
  });
  const expiring: { id: string; verifiedAt: Date; expiresAt: Date }[] = [];
  const expired: { id: string; verifiedAt: Date; expiresAt: Date }[] = [];
  for (const r of rows) {
    const expiresAt = expiry(r.verifiedAt!);
    if (expiresAt <= now) expired.push({ id: r.id, verifiedAt: r.verifiedAt!, expiresAt });
    else if (expiresAt <= cutoffWarn) expiring.push({ id: r.id, verifiedAt: r.verifiedAt!, expiresAt });
  }
  return { expiring, expired };
}
