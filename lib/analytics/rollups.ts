import { prisma } from "@/lib/db";
import type { Prisma, RollupPeriod } from "@/generated/prisma/client";

// Automation Engine, Phase G: weekly (Mon–Sun) and monthly summaries in Dar es Salaam time,
// computed once a period is over and then kept as they were. Counts only.

const DAY = 86_400_000;
const EAT = 3 * 3_600_000;

/** Dar calendar date at UTC midnight (how @db.Date columns are read back). */
function darDate(now: Date): Date {
  const d = new Date(now.getTime() + EAT);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday of the last finished week. */
export function lastWeekStart(now: Date): Date {
  const today = darDate(now);
  const dow = (today.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(today.getTime() - (dow + 7) * DAY);
}

/** First day of the last finished month. */
export function lastMonthStart(now: Date): Date {
  const today = darDate(now);
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
}

export function periodRange(period: RollupPeriod, start: Date) {
  const end = period === "WEEK" ? new Date(start.getTime() + 7 * DAY) : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  // Dates for @db.Date columns; instants (Dar midnight) for timestamps.
  return { start, end, startTs: new Date(start.getTime() - EAT), endTs: new Date(end.getTime() - EAT) };
}

export type ProviderMetrics = { views: number; appearances: number; contacts: number; requests: number; responded: number; completed: number; reviews: number; ratingSum: number };
export type PlatformMetrics = {
  newCustomers: number;
  newProviders: number;
  requests: number;
  completed: number;
  reviews: number;
  avgRating: number | null;
  views: number;
  appearances: number;
  contacts: number;
  trips: number;
  revenueTzs: number;
};

const EMPTY: ProviderMetrics = { views: 0, appearances: 0, contacts: 0, requests: 0, responded: 0, completed: 0, reviews: 0, ratingSum: 0 };

export function activity(m: ProviderMetrics): number {
  return m.views + m.appearances + m.contacts + m.requests + m.reviews;
}

/** Every business's numbers for one period, from the same tables the live dashboards use. */
export async function providerMetrics(period: RollupPeriod, start: Date): Promise<Map<string, ProviderMetrics>> {
  const r = periodRange(period, start);
  const days = { gte: r.start, lt: r.end };
  const ts = { gte: r.startTs, lt: r.endTs };
  const [metric, taps, matches, responded, completed, reviews] = await Promise.all([
    prisma.providerMetric.groupBy({ by: ["providerId", "kind"], where: { day: days }, _count: { _all: true } }),
    prisma.connectEvent.groupBy({ by: ["providerId"], where: { day: days }, _count: { _all: true } }),
    prisma.requestMatch.groupBy({ by: ["providerId"], where: { notifiedAt: ts }, _count: { _all: true } }),
    prisma.requestMatch.groupBy({ by: ["providerId"], where: { firstResponseAt: ts }, _count: { _all: true } }),
    prisma.serviceRequest.groupBy({ by: ["acceptedProviderId"], where: { status: "COMPLETED", completedAt: ts, acceptedProviderId: { not: null } }, _count: { _all: true } }),
    prisma.review.groupBy({ by: ["providerId"], where: { status: "PUBLISHED", createdAt: ts }, _count: { _all: true }, _sum: { rating: true } }),
  ]);
  const out = new Map<string, ProviderMetrics>();
  const get = (id: string) => {
    let m = out.get(id);
    if (!m) out.set(id, (m = { ...EMPTY }));
    return m;
  };
  for (const x of metric) get(x.providerId)[x.kind === "PROFILE_VIEW" ? "views" : "appearances"] += x._count._all;
  for (const x of taps) get(x.providerId).contacts += x._count._all;
  for (const x of matches) get(x.providerId).requests += x._count._all;
  for (const x of responded) get(x.providerId).responded += x._count._all;
  for (const x of completed) get(x.acceptedProviderId!).completed += x._count._all;
  for (const x of reviews) {
    const m = get(x.providerId);
    m.reviews += x._count._all;
    m.ratingSum += x._sum.rating ?? 0;
  }
  return out;
}

export async function platformMetrics(period: RollupPeriod, start: Date): Promise<PlatformMetrics> {
  const r = periodRange(period, start);
  const days = { gte: r.start, lt: r.end };
  const ts = { gte: r.startTs, lt: r.endTs };
  const [users, requests, completed, reviews, metric, contacts, trips, revenue] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { createdAt: ts, deletedAt: null }, _count: { _all: true } }),
    prisma.serviceRequest.count({ where: { createdAt: ts } }),
    prisma.serviceRequest.count({ where: { status: "COMPLETED", completedAt: ts } }),
    prisma.review.aggregate({ where: { status: "PUBLISHED", createdAt: ts }, _count: { _all: true }, _avg: { rating: true } }),
    prisma.providerMetric.groupBy({ by: ["kind"], where: { day: days }, _count: { _all: true } }),
    prisma.connectEvent.count({ where: { day: days } }),
    prisma.trip.count({ where: { status: "COMPLETED", completedAt: ts } }),
    prisma.payment.aggregate({ where: { status: "RECORDED", paidAt: ts }, _sum: { amountTzs: true } }),
  ]);
  const role = (x: string) => users.find((u) => u.role === x)?._count._all ?? 0;
  return {
    newCustomers: role("CUSTOMER"),
    newProviders: role("PROVIDER"),
    requests,
    completed,
    reviews: reviews._count._all,
    avgRating: reviews._avg.rating == null ? null : Math.round(reviews._avg.rating * 10) / 10,
    views: metric.find((m) => m.kind === "PROFILE_VIEW")?._count._all ?? 0,
    appearances: metric.find((m) => m.kind === "SEARCH_APPEARANCE")?._count._all ?? 0,
    contacts,
    trips,
    revenueTzs: revenue._sum.amountTzs ?? 0,
  };
}

/**
 * Stores the summaries of one finished period (platform + every business with any activity).
 * Existing rows are left as they are, so a period is computed once. Returns the stored provider rows.
 */
export async function rollUp(period: RollupPeriod, start: Date): Promise<{ platform: boolean; providers: Map<string, ProviderMetrics> }> {
  const [platform, providers] = await Promise.all([platformMetrics(period, start), providerMetrics(period, start)]);
  const active = [...providers].filter(([, m]) => activity(m) > 0);
  const r = await prisma.metricRollup.createMany({
    data: [
      { period, periodStart: start, scope: "PLATFORM", scopeId: "", metrics: platform as unknown as Prisma.InputJsonValue },
      ...active.map(([id, m]) => ({ period, periodStart: start, scope: "PROVIDER", scopeId: id, metrics: m as unknown as Prisma.InputJsonValue })),
    ],
    skipDuplicates: true,
  });
  // What's stored is the truth for this period (an earlier run may have saved it already).
  const stored = await prisma.metricRollup.findMany({ where: { period, periodStart: start, scope: "PROVIDER" }, select: { scopeId: true, metrics: true } });
  return { platform: r.count > 0, providers: new Map(stored.map((x) => [x.scopeId, x.metrics as unknown as ProviderMetrics])) };
}

export async function platformRollups(period: RollupPeriod, take: number) {
  const rows = await prisma.metricRollup.findMany({ where: { scope: "PLATFORM", scopeId: "", period }, orderBy: { periodStart: "desc" }, take });
  return rows.map((r) => ({ periodStart: r.periodStart, metrics: r.metrics as unknown as PlatformMetrics }));
}

/** The business's last two finished weeks, for "this week vs the week before". */
export async function providerWeeks(providerId: string, take = 2) {
  const rows = await prisma.metricRollup.findMany({ where: { scope: "PROVIDER", scopeId: providerId, period: "WEEK" }, orderBy: { periodStart: "desc" }, take });
  return rows.map((r) => ({ periodStart: r.periodStart, metrics: r.metrics as unknown as ProviderMetrics }));
}

/** Percentage change, or null when there's nothing to compare with. */
export function change(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}
