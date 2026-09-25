// Smart ranking (Phase 8). Pure and unit-tested: every signal is normalised to 0…1 from real
// provider data, then combined with admin-configured weights. Nothing here reads payment or
// promotion status — paid placement (Phase 11) is layered on top of this organic order as clearly
// labelled slots and can never change a provider's score or trust signals (ADR-040).

export const SIGNALS = [
  "serviceRelevance",
  "locationRelevance",
  "serviceArea",
  "distance",
  "availability",
  "verification",
  "rating",
  "reviewQuality",
  "responseRate",
  "responseTime",
  "profileCompleteness",
  "recentActivity",
] as const;

export type Signal = (typeof SIGNALS)[number];
export type Weights = Record<Signal, number>;
export type SignalValues = Record<Signal, number>;

export const MAX_WEIGHT = 10;

/**
 * Defaults: what the customer asked for and where they are come first; trust and responsiveness
 * then separate comparable providers. Tuned so that a weak text match can't beat an exact one on
 * distance or trust alone, and a provider serving the customer's area beats a closer one that doesn't.
 */
export const DEFAULT_WEIGHTS: Weights = {
  serviceRelevance: 10,
  locationRelevance: 8,
  serviceArea: 3,
  distance: 5,
  availability: 3,
  verification: 4,
  rating: 4,
  reviewQuality: 2,
  responseRate: 2,
  responseTime: 2,
  profileCompleteness: 2,
  recentActivity: 1,
};

/** Relevance can be weighted but never switched off: results must stay about what was asked. */
export const MIN_WEIGHTS: Partial<Weights> = { serviceRelevance: 1 };

/** Accepts only known signals with whole weights in range; anything missing takes the default. */
export function sanitizeWeights(input: unknown): Weights {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_WEIGHTS };
  for (const s of SIGNALS) {
    const v = src[s];
    if (typeof v === "number" && Number.isInteger(v) && v >= (MIN_WEIGHTS[s] ?? 0) && v <= MAX_WEIGHT) out[s] = v;
  }
  return out;
}

// ─── Normalisers (each 0…1) ─────────────────────────────────────────────────────────────────

/** Text match score (0.55 threshold … 1 exact) → 0…1. No text query (browsing a service/category) = 1. */
export function relevanceScore(textScore: number | null): number {
  if (textScore == null) return 1;
  return clamp((textScore - 0.55) / 0.45);
}

/** 0 = based in the area … 3 = elsewhere (AreaTier). No area chosen = neutral. */
export function locationScore(tier: number | null): number {
  if (tier == null) return 0.5;
  return [1, 0.8, 0.5, 0.1][tier] ?? 0.1;
}

/** Lists the customer's area as a service area, or their travel radius reaches the customer. */
export function serviceAreaScore(serves: boolean | null): number {
  return serves == null ? 0.5 : serves ? 1 : 0;
}

/** Smooth decay: 1 km ≈ 0.75, 3 km = 0.5, 10 km ≈ 0.23. Unknown distance scores low, not zero. */
export function distanceScore(km: number | null, hasOrigin: boolean): number {
  if (!hasOrigin) return 0.5;
  if (km == null) return 0.2;
  return 1 / (1 + Math.max(0, km) / 3);
}

export function availabilityScore(state: "OPEN" | "ALWAYS" | "APPOINTMENT" | "CLOSED" | "UNKNOWN"): number {
  return state === "OPEN" || state === "ALWAYS" ? 1 : state === "APPOINTMENT" ? 0.5 : state === "UNKNOWN" ? 0.3 : 0;
}

/** Admin-approved verification level rank relative to the highest level that exists. */
export function verificationScore(rank: number | null, maxRank: number): number {
  if (rank == null || maxRank <= 0) return 0;
  return clamp(rank / maxRank);
}

export const RATING_PRIOR = 3.5;
export const RATING_PRIOR_WEIGHT = 5;

/**
 * Bayesian average: a few 5-star reviews don't beat many 4.8s, and a provider with no reviews sits
 * at the prior (neutral) rather than at zero.
 */
export function ratingScore(avg: number | null, count: number): number {
  const n = avg == null ? 0 : count;
  const bayes = (RATING_PRIOR * RATING_PRIOR_WEIGHT + (avg ?? 0) * n) / (RATING_PRIOR_WEIGHT + n);
  return clamp((bayes - 1) / 4);
}

/** Share of reviews from verified jobs, plus volume (saturating at 20 reviews). */
export function reviewQualityScore(published: number, verified: number): number {
  if (published <= 0) return 0;
  const share = Math.min(verified, published) / published;
  const volume = Math.min(1, Math.log10(1 + published) / Math.log10(21));
  return 0.5 * share + 0.5 * volume;
}

/** Share of received requests answered (interest, quote, message or decline). New providers start at 0.5. */
export function responseRateScore(due: number, responded: number): number {
  return (Math.min(responded, due) + 1) / (due + 2);
}

/** Minimum answered requests before response time counts (and before "Fast response" is shown). */
export const MIN_RESPONSE_SAMPLES = 3;

/** Median minutes to first response: 15 min ≈ 0.89, 1 h ≈ 0.67, 4 h = 0.33. Too few samples = neutral. */
export function responseTimeScore(medianMinutes: number | null, samples: number): number {
  if (medianMinutes == null || samples < MIN_RESPONSE_SAMPLES) return 0.5;
  return 1 / (1 + Math.max(0, medianMinutes) / 120);
}

export function completenessScore(percent: number): number {
  return clamp(percent / 100);
}

/** Last profile edit or reply to a customer: full marks within a week, fading to 0 at 90 days. */
export function recentActivityScore(lastActive: Date | null, now: Date): number {
  if (!lastActive) return 0;
  const days = (now.getTime() - lastActive.getTime()) / 86_400_000;
  if (days <= 7) return 1;
  return clamp(1 - (days - 7) / 83);
}

// ─── Combining ──────────────────────────────────────────────────────────────────────────────

export type Scored = { score: number; breakdown: SignalValues };

/** Weighted mean of the signals (0…1). The breakdown is kept for the admin preview. */
export function rankScore(values: SignalValues, weights: Weights): Scored {
  let total = 0;
  let sum = 0;
  for (const s of SIGNALS) {
    total += weights[s];
    sum += weights[s] * clamp(values[s]);
  }
  return { score: total > 0 ? sum / total : 0, breakdown: values };
}

/** Highest score first; ties keep the longest-listed provider first, then a stable id order. */
export function compareScored(a: { score: number; publishedAt: Date | null; id: string }, b: { score: number; publishedAt: Date | null; id: string }): number {
  return (
    b.score - a.score ||
    (a.publishedAt?.getTime() ?? Infinity) - (b.publishedAt?.getTime() ?? Infinity) ||
    a.id.localeCompare(b.id)
  );
}

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
