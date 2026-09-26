import { prisma } from "@/lib/db";
import { memo, REFERENCE_TTL_MS } from "@/lib/cache";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/services/audit";
import { DEFAULT_WEIGHTS, MIN_RESPONSE_SAMPLES, sanitizeWeights, SIGNALS, type Weights } from "@/lib/ranking/engine";

// Ranking configuration and the measured signals behind it (Phase 8).

const CONFIG_ID = "default";
const CACHE_MS = 30_000;
let cached: { weights: Weights; at: number } | null = null;

/** Current weights (defaults until an admin saves some). Cached briefly; a save clears the cache. */
export async function getWeights(): Promise<Weights> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.weights;
  const row = await prisma.rankingConfig.findUnique({ where: { id: CONFIG_ID }, select: { weights: true } });
  const weights = row ? sanitizeWeights(row.weights) : { ...DEFAULT_WEIGHTS };
  cached = { weights, at: Date.now() };
  return weights;
}

export async function getWeightsInfo() {
  const row = await prisma.rankingConfig.findUnique({ where: { id: CONFIG_ID }, select: { updatedAt: true, updatedById: true } });
  const by = row?.updatedById ? await prisma.user.findUnique({ where: { id: row.updatedById }, select: { name: true } }) : null;
  return { weights: await getWeights(), updatedAt: row?.updatedAt ?? null, updatedBy: by?.name ?? null };
}

/** Saves weights (already validated by the caller's schema) and records old → new in the audit log. */
export async function saveWeights(actorId: string, weights: Weights): Promise<void> {
  const clean = sanitizeWeights(weights);
  await prisma.$transaction(async (tx) => {
    const before = await tx.rankingConfig.findUnique({ where: { id: CONFIG_ID }, select: { weights: true } });
    await tx.rankingConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, weights: clean, updatedById: actorId },
      update: { weights: clean, updatedById: actorId },
    });
    await audit(tx, {
      actorId,
      action: "ranking.weights_saved",
      entityType: "RankingConfig",
      entityId: CONFIG_ID,
      metadata: { before: before ? sanitizeWeights(before.weights) : DEFAULT_WEIGHTS, after: clean },
    });
  });
  cached = null;
}

export async function resetWeights(actorId: string): Promise<void> {
  await saveWeights(actorId, { ...DEFAULT_WEIGHTS });
}

// ─── Measured signals ───────────────────────────────────────────────────────────────────────

export type ProviderStats = {
  /** Requests received ≥ 24 h ago or already answered (so brand-new requests don't count against anyone). */
  due: number;
  responded: number;
  /** Median minutes from notification to first response; null when there are no answers. */
  medianResponseMinutes: number | null;
  responseSamples: number;
  lastResponseAt: Date | null;
  reviewsPublished: number;
  reviewsVerified: number;
};

const WINDOW_DAYS = 90;
const EMPTY: ProviderStats = { due: 0, responded: 0, medianResponseMinutes: null, responseSamples: 0, lastResponseAt: null, reviewsPublished: 0, reviewsVerified: 0 };

/** Response and review statistics for a set of providers, in two grouped queries. */
export async function providerStats(providerIds: string[], now: Date = new Date()): Promise<Map<string, ProviderStats>> {
  const out = new Map<string, ProviderStats>(providerIds.map((id) => [id, { ...EMPTY }]));
  if (!providerIds.length) return out;
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const dueBefore = new Date(now.getTime() - 24 * 3_600_000);

  const [responses, reviews] = await Promise.all([
    prisma.$queryRaw<{ providerId: string; due: number; responded: number; samples: number; median: number | null; last: Date | null }[]>`
      SELECT "providerId",
        COUNT(*) FILTER (WHERE "notifiedAt" < ${dueBefore} OR "firstResponseAt" IS NOT NULL OR "status" = 'DECLINED')::int AS due,
        COUNT(*) FILTER (WHERE "firstResponseAt" IS NOT NULL OR "status" = 'DECLINED')::int AS responded,
        COUNT("firstResponseAt")::int AS samples,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("firstResponseAt" - "notifiedAt")) / 60)
          FILTER (WHERE "firstResponseAt" IS NOT NULL) AS median,
        MAX("firstResponseAt") AS last
      FROM "RequestMatch"
      WHERE "providerId" IN (${Prisma.join(providerIds)}) AND "notifiedAt" >= ${since}
      GROUP BY "providerId"`,
    prisma.review.groupBy({
      by: ["providerId", "verifiedJob"],
      where: { providerId: { in: providerIds }, status: "PUBLISHED" },
      _count: { _all: true },
    }),
  ]);
  for (const r of responses) {
    const s = out.get(r.providerId)!;
    s.due = r.due;
    s.responded = r.responded;
    s.responseSamples = r.samples;
    s.medianResponseMinutes = r.median == null ? null : Math.round(Number(r.median));
    s.lastResponseAt = r.last;
  }
  for (const r of reviews) {
    const s = out.get(r.providerId)!;
    s.reviewsPublished += r._count._all;
    if (r.verifiedJob) s.reviewsVerified += r._count._all;
  }
  return out;
}

/** Median response time to show as "Fast response" — only with enough answered requests. */
export function publicMedianResponse(s: ProviderStats | undefined): number | null {
  return s && s.responseSamples >= MIN_RESPONSE_SAMPLES ? s.medianResponseMinutes : null;
}

/** Highest verification rank that exists (for normalising the verification signal). */
export async function maxVerificationRank(): Promise<number> {
  return memo("ref:maxVerificationRank", REFERENCE_TTL_MS, async () => {
    const r = await prisma.verificationLevel.aggregate({ where: { isActive: true }, _max: { rank: true } });
    return r._max.rank ?? 1;
  });
}

export { SIGNALS };
