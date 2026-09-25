import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { darDay } from "@/lib/services/connectEvents";

// Admin: platform analytics and the audit log (Phase 12). Aggregates only — no per-person data.

const DAY = 86_400_000;
const DAR_OFFSET = 3 * 3_600_000;

export async function platformAnalytics(days: 7 | 30 | 90 = 30, now = new Date()) {
  const today = darDay(now);
  const since = new Date(today.getTime() - (days - 1) * DAY);
  const sinceTs = new Date(since.getTime() - DAR_OFFSET);
  const inPeriod = { gte: since, lte: today };

  const [
    usersByRole,
    newUsers,
    providersByStatus,
    requestsByStatus,
    requestsNew,
    taps,
    metrics,
    reviews,
    openReports,
    openReviewReports,
    pendingVerification,
    revenue,
    activeSubs,
    dailyRequests,
    dailyUsers,
    topCategories,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ["role"], where: { deletedAt: null, createdAt: { gte: sinceTs } }, _count: { _all: true } }),
    prisma.provider.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.serviceRequest.groupBy({ by: ["status"], where: { createdAt: { gte: sinceTs } }, _count: { _all: true } }),
    prisma.serviceRequest.count({ where: { createdAt: { gte: sinceTs } } }),
    prisma.connectEvent.count({ where: { day: inPeriod } }),
    prisma.providerMetric.groupBy({ by: ["kind"], where: { day: inPeriod }, _count: { _all: true } }),
    prisma.review.aggregate({ where: { status: "PUBLISHED", createdAt: { gte: sinceTs } }, _count: { _all: true }, _avg: { rating: true } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.review.count({ where: { reports: { some: { status: "OPEN" } } } }),
    prisma.verificationRequest.count({ where: { status: "SUBMITTED" } }),
    prisma.payment.aggregate({ where: { status: "RECORDED", paidAt: { gte: sinceTs } }, _sum: { amountTzs: true }, _count: { _all: true } }),
    prisma.subscription.count({ where: { status: "ACTIVE", currentPeriodEnd: { gt: now } } }),
    prisma.$queryRaw<{ day: Date; n: number }[]>`
      SELECT date_trunc('day', "createdAt" + interval '3 hours')::date AS day, COUNT(*)::int AS n
      FROM "ServiceRequest" WHERE "createdAt" >= ${sinceTs} GROUP BY 1`,
    prisma.$queryRaw<{ day: Date; n: number }[]>`
      SELECT date_trunc('day', "createdAt" + interval '3 hours')::date AS day, COUNT(*)::int AS n
      FROM "User" WHERE "createdAt" >= ${sinceTs} AND "deletedAt" IS NULL GROUP BY 1`,
    prisma.$queryRaw<{ nameEn: string; nameSw: string; n: number }[]>`
      SELECT COALESCE(pc."nameEn", c."nameEn") AS "nameEn", COALESCE(pc."nameSw", c."nameSw") AS "nameSw", COUNT(*)::int AS n
      FROM "ServiceRequest" r
      JOIN "Category" c ON c.id = r."categoryId"
      LEFT JOIN "Category" pc ON pc.id = c."parentId"
      WHERE r."createdAt" >= ${sinceTs}
      GROUP BY 1, 2 ORDER BY n DESC LIMIT 6`,
  ]);

  const count = <T extends string>(rows: { _count: { _all: number } }[], key: (r: never) => T, k: T) =>
    (rows as { _count: { _all: number } }[]).find((r) => key(r as never) === k)?._count._all ?? 0;
  const role = (rows: typeof usersByRole, r: string) => count(rows, (x: { role: string }) => x.role, r);
  const reqStatus = (s: string) => count(requestsByStatus, (x: { status: string }) => x.status, s);
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * DAY);
    const key = d.toISOString().slice(0, 10);
    return {
      day: d,
      requests: dailyRequests.find((r) => new Date(r.day).toISOString().slice(0, 10) === key)?.n ?? 0,
      users: dailyUsers.find((r) => new Date(r.day).toISOString().slice(0, 10) === key)?.n ?? 0,
    };
  });

  return {
    days,
    users: {
      customers: role(usersByRole, "CUSTOMER"),
      providers: role(usersByRole, "PROVIDER"),
      admins: role(usersByRole, "ADMIN") + role(usersByRole, "SUPER_ADMIN"),
      newCustomers: role(newUsers, "CUSTOMER"),
      newProviders: role(newUsers, "PROVIDER"),
    },
    listings: Object.fromEntries(providersByStatus.map((p) => [p.status, p._count._all])) as Record<string, number>,
    requests: { created: requestsNew, accepted: reqStatus("ACCEPTED") + reqStatus("COMPLETED"), completed: reqStatus("COMPLETED"), cancelled: reqStatus("CANCELLED") },
    engagement: {
      appearances: metrics.find((m) => m.kind === "SEARCH_APPEARANCE")?._count._all ?? 0,
      views: metrics.find((m) => m.kind === "PROFILE_VIEW")?._count._all ?? 0,
      taps,
    },
    reviews: { count: reviews._count._all, avg: reviews._avg.rating },
    attention: { openReports, openReviewReports, pendingVerification },
    money: { revenueTzs: revenue._sum.amountTzs ?? 0, payments: revenue._count._all, activeSubscriptions: activeSubs },
    topCategories,
    series,
  };
}

export const AUDIT_PAGE_SIZE = 50;

export async function auditLog(input: { action: string | null; entityType: string | null; actorId: string | null; page: number }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(input.action ? { action: { startsWith: input.action } } : {}),
    ...(input.entityType ? { entityType: input.entityType } : {}),
    ...(input.actorId ? { actorId: input.actorId } : {}),
  };
  const [total, rows, entityTypes] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (input.page - 1) * AUDIT_PAGE_SIZE, take: AUDIT_PAGE_SIZE }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  const actors = new Map(
    (await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))] } }, select: { id: true, name: true, role: true } })).map((u) => [u.id, u]),
  );
  return {
    total,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    rows: rows.map((r) => ({ ...r, actor: r.actorId ? (actors.get(r.actorId) ?? null) : null })),
    entityTypes: entityTypes.map((e) => e.entityType),
  };
}
