import { prisma } from "@/lib/db";
import { darDay, visitorHash } from "@/lib/services/connectEvents";
import type { ConnectAction } from "@/lib/provider/connect";

// Provider analytics (Phase 10). Counting rules match the contact-tap analytics (ADR-034): one row
// per provider × kind × person × Dar day, only a salted daily hash of the anonymous cookie is kept,
// the provider's own team and admins are never counted, bots and link prefetches are ignored.

export type MetricKind = "PROFILE_VIEW" | "SEARCH_APPEARANCE";
export type MetricSource = "SEARCH" | "AI_SEARCH" | "CATEGORY" | "HOME" | "REQUEST" | "SAVED" | "OTHER";
export const METRIC_SOURCES: MetricSource[] = ["SEARCH", "AI_SEARCH", "CATEGORY", "HOME", "REQUEST", "SAVED", "OTHER"];

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|skype|curl|wget|python|httpclient|headless|lighthouse|monitor/i;

/** Crawlers, link-preview fetchers and scripts aren't customers. */
export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT.test(userAgent);
}

/** Router/browser prefetches render pages nobody has looked at yet. */
export function isPrefetch(headers: { get(name: string): string | null }): boolean {
  return (
    !!headers.get("next-router-prefetch") ||
    headers.get("purpose") === "prefetch" ||
    headers.get("sec-purpose")?.includes("prefetch") === true ||
    headers.get("x-middleware-prefetch") === "1"
  );
}

/** Where a profile visit came from, by the (same-origin) referring page. */
export function sourceFromReferer(referer: string | null, host: string | null): MetricSource {
  if (!referer || !host) return "OTHER";
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return "OTHER";
  }
  if (url.host !== host) return "OTHER";
  const p = url.pathname;
  const under = (prefix: string) => p === prefix || p.startsWith(`${prefix}/`);
  if (p === "/") return "HOME";
  if (under("/search")) return "SEARCH";
  if (under("/ask")) return "AI_SEARCH";
  if (under("/c") || under("/categories")) return "CATEGORY";
  if (under("/requests")) return "REQUEST";
  if (under("/saved")) return "SAVED";
  return "OTHER";
}

export type MetricInput = {
  kind: MetricKind;
  providerIds: string[];
  source: MetricSource;
  serviceId?: string | null;
  locationId?: string | null;
  visitorId: string;
  viewer: { id: string; role: string } | null;
  now?: Date;
};

/** Records one row per live provider for this person today; repeats the same day are ignored. */
export async function recordMetrics(input: MetricInput): Promise<number> {
  if (!input.providerIds.length) return 0;
  if (input.viewer && (input.viewer.role === "ADMIN" || input.viewer.role === "SUPER_ADMIN")) return 0;
  const ids = [...new Set(input.providerIds)].slice(0, 200);
  const live = await prisma.provider.findMany({
    where: {
      id: { in: ids },
      status: "ACTIVE",
      deletedAt: null,
      // The provider's own members never count as customers.
      ...(input.viewer ? { members: { none: { userId: input.viewer.id } } } : {}),
    },
    select: { id: true },
  });
  if (!live.length) return 0;
  const day = darDay(input.now);
  const res = await prisma.providerMetric.createMany({
    data: live.map((p) => ({
      providerId: p.id,
      kind: input.kind,
      source: input.source,
      serviceId: input.serviceId ?? null,
      locationId: input.locationId ?? null,
      day,
      visitorHash: visitorHash(input.visitorId, p.id, day),
    })),
    skipDuplicates: true,
  });
  return res.count;
}

// ─── Reading ────────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

function range(days: number, now: Date) {
  const today = darDay(now);
  const since = new Date(today.getTime() - (days - 1) * DAY);
  const prevSince = new Date(since.getTime() - days * DAY);
  return { today, since, prevSince };
}

const TAP_ACTIONS: ConnectAction[] = ["CALL", "WHATSAPP", "MESSAGE", "WEBSITE", "EMAIL", "DIRECTIONS", "BOOK_SERVICE", "BOOK_RIDE", "REQUEST_QUOTE"];

export type Analytics = Awaited<ReturnType<typeof providerAnalytics>>;

/**
 * Everything the "How customers are finding you" page shows, for the last `days` Dar days and the
 * same span before it (for comparison). All counts are people-per-day, never raw hits.
 */
export async function providerAnalytics(providerId: string, days: Period = 30, now: Date = new Date()) {
  const { today, since, prevSince } = range(days, now);
  const inPeriod = { gte: since, lte: today };
  const inPrev = { gte: prevSince, lt: since };
  // Timestamps (requests, reviews, saves) are compared from midnight in Dar es Salaam (UTC+3).
  const DAR_OFFSET = 3 * 3_600_000;
  const sinceTs = new Date(since.getTime() - DAR_OFFSET);
  const prevTs = new Date(prevSince.getTime() - DAR_OFFSET);

  const [
    metricTotals,
    metricPrev,
    bySource,
    topServices,
    topAreas,
    taps,
    tapsPrev,
    dailyMetrics,
    dailyTaps,
    requests,
    requestsPrev,
    reviews,
    favorites,
    favoritesNew,
  ] = await Promise.all([
    prisma.providerMetric.groupBy({ by: ["kind"], where: { providerId, day: inPeriod }, _count: { _all: true } }),
    prisma.providerMetric.groupBy({ by: ["kind"], where: { providerId, day: inPrev }, _count: { _all: true } }),
    prisma.providerMetric.groupBy({ by: ["kind", "source"], where: { providerId, day: inPeriod }, _count: { _all: true } }),
    prisma.providerMetric.groupBy({
      by: ["serviceId"],
      where: { providerId, kind: "SEARCH_APPEARANCE", day: inPeriod, serviceId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { serviceId: "desc" } },
      take: 5,
    }),
    prisma.providerMetric.groupBy({
      by: ["locationId"],
      where: { providerId, kind: "SEARCH_APPEARANCE", day: inPeriod, locationId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { locationId: "desc" } },
      take: 5,
    }),
    prisma.connectEvent.groupBy({ by: ["action"], where: { providerId, day: inPeriod }, _count: { _all: true } }),
    prisma.connectEvent.count({ where: { providerId, day: inPrev } }),
    prisma.providerMetric.groupBy({ by: ["day", "kind"], where: { providerId, day: inPeriod }, _count: { _all: true } }),
    prisma.connectEvent.groupBy({ by: ["day"], where: { providerId, day: inPeriod }, _count: { _all: true } }),
    prisma.$queryRaw<{ received: number; responded: number; quoted: number; won: number; completed: number; median: number | null }[]>`
      SELECT COUNT(*)::int AS received,
        COUNT(*) FILTER (WHERE m."firstResponseAt" IS NOT NULL OR m."status" = 'DECLINED')::int AS responded,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Quote" q WHERE q."requestId" = m."requestId" AND q."providerId" = m."providerId"))::int AS quoted,
        COUNT(*) FILTER (WHERE r."acceptedProviderId" = m."providerId")::int AS won,
        COUNT(*) FILTER (WHERE r."acceptedProviderId" = m."providerId" AND r."status" = 'COMPLETED')::int AS completed,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (m."firstResponseAt" - m."notifiedAt")) / 60)
          FILTER (WHERE m."firstResponseAt" IS NOT NULL) AS median
      FROM "RequestMatch" m JOIN "ServiceRequest" r ON r.id = m."requestId"
      WHERE m."providerId" = ${providerId} AND m."notifiedAt" >= ${sinceTs}`,
    prisma.requestMatch.count({ where: { providerId, notifiedAt: { gte: prevTs, lt: sinceTs } } }),
    prisma.review.aggregate({
      where: { providerId, status: "PUBLISHED", createdAt: { gte: sinceTs } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    prisma.favorite.count({ where: { providerId } }),
    prisma.favorite.count({ where: { providerId, createdAt: { gte: sinceTs } } }),
  ]);

  const kindCount = (rows: { kind: string; _count: { _all: number } }[], kind: MetricKind) => rows.find((r) => r.kind === kind)?._count._all ?? 0;
  const appearances = kindCount(metricTotals, "SEARCH_APPEARANCE");
  const views = kindCount(metricTotals, "PROFILE_VIEW");
  const tapsByAction = Object.fromEntries(TAP_ACTIONS.map((a) => [a, taps.find((t) => t.action === a)?._count._all ?? 0])) as Record<ConnectAction, number>;
  const tapTotal = Object.values(tapsByAction).reduce((a, b) => a + b, 0);
  const req = requests[0] ?? { received: 0, responded: 0, quoted: 0, won: 0, completed: 0, median: null };

  const sources = (kind: MetricKind) =>
    METRIC_SOURCES.map((source) => ({ source, count: bySource.find((r) => r.kind === kind && r.source === source)?._count._all ?? 0 })).filter((s) => s.count > 0);

  // Names for the top services/areas people filtered by when they saw this provider.
  const [serviceNames, areaNames] = await Promise.all([
    prisma.service.findMany({ where: { id: { in: topServices.map((s) => s.serviceId!) } }, select: { id: true, nameEn: true, nameSw: true } }),
    prisma.location.findMany({ where: { id: { in: topAreas.map((a) => a.locationId!) } }, select: { id: true, name: true } }),
  ]);

  // Daily series, one entry per Dar day in the period (zeros included) for the trend chart.
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * DAY);
    const key = d.getTime();
    const m = (kind: MetricKind) => dailyMetrics.find((r) => r.day.getTime() === key && r.kind === kind)?._count._all ?? 0;
    return { day: d, appearances: m("SEARCH_APPEARANCE"), views: m("PROFILE_VIEW"), taps: dailyTaps.find((r) => r.day.getTime() === key)?._count._all ?? 0 };
  });

  const rate = (num: number, den: number) => (den > 0 ? num / den : null);
  return {
    days,
    since,
    today,
    appearances: { count: appearances, previous: kindCount(metricPrev, "SEARCH_APPEARANCE"), bySource: sources("SEARCH_APPEARANCE") },
    views: { count: views, previous: kindCount(metricPrev, "PROFILE_VIEW"), bySource: sources("PROFILE_VIEW") },
    taps: { count: tapTotal, previous: tapsPrev, byAction: tapsByAction },
    requests: { ...req, median: req.median == null ? null : Math.round(Number(req.median)), previous: requestsPrev },
    reviews: { count: reviews._count._all, avg: reviews._avg.rating },
    favorites: { total: favorites, added: favoritesNew },
    topServices: topServices.map((s) => ({ service: serviceNames.find((n) => n.id === s.serviceId) ?? null, count: s._count._all })).filter((s) => s.service),
    topAreas: topAreas.map((a) => ({ name: areaNames.find((n) => n.id === a.locationId)?.name ?? null, count: a._count._all })).filter((a) => a.name),
    conversion: {
      // Of the people who saw you in results, how many opened your profile.
      viewRate: rate(views, appearances),
      // Of the people who opened your profile, how many tapped a contact button.
      contactRate: rate(tapTotal, views),
      // Of the requests you received, how many customers chose you.
      winRate: rate(req.won, req.received),
      responseRate: rate(req.responded, req.received),
    },
    series,
  };
}

export const _test = { range };
