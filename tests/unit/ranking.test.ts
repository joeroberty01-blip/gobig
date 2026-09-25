import { describe, expect, it } from "vitest";
import {
  availabilityScore,
  compareScored,
  DEFAULT_WEIGHTS,
  distanceScore,
  locationScore,
  rankScore,
  ratingScore,
  recentActivityScore,
  relevanceScore,
  responseRateScore,
  responseTimeScore,
  reviewQualityScore,
  sanitizeWeights,
  serviceAreaScore,
  SIGNALS,
  verificationScore,
  type SignalValues,
  type Weights,
} from "@/lib/ranking/engine";
import { weightsSchema } from "@/lib/validators/ranking";
import { can } from "@/lib/permissions";
import { AreaTier } from "@/lib/discovery/query";
import { trustBadges } from "@/lib/provider/trust";
import { getDictionary } from "@/lib/i18n/dictionaries";

const neutral: SignalValues = {
  serviceRelevance: 1,
  locationRelevance: locationScore(AreaTier.InArea),
  serviceArea: serviceAreaScore(true),
  distance: distanceScore(1, true),
  availability: availabilityScore("CLOSED"),
  verification: 0,
  rating: ratingScore(null, 0),
  reviewQuality: 0,
  responseRate: responseRateScore(0, 0),
  responseTime: responseTimeScore(null, 0),
  profileCompleteness: 0.7,
  recentActivity: 1,
};

const rank = (rows: { id: string; v: Partial<SignalValues> }[], w: Weights = DEFAULT_WEIGHTS) =>
  rows
    .map((r) => ({ id: r.id, publishedAt: new Date("2026-01-01"), ...rankScore({ ...neutral, ...r.v }, w) }))
    .sort(compareScored)
    .map((r) => r.id);

describe("default ranking keeps the Phase 3–4 guarantees", () => {
  it("relevance beats distance", () => {
    expect(rank([
      { id: "near-weak", v: { serviceRelevance: relevanceScore(0.6), distance: distanceScore(0.5, true) } },
      { id: "far-exact", v: { serviceRelevance: relevanceScore(1), distance: distanceScore(15, true) } },
    ])[0]).toBe("far-exact");
  });

  it("serving the customer's area beats being closer but elsewhere", () => {
    expect(rank([
      { id: "close-elsewhere", v: { locationRelevance: locationScore(AreaTier.Elsewhere), serviceArea: 0, distance: distanceScore(1, true) } },
      { id: "serves-farther", v: { locationRelevance: locationScore(AreaTier.ServesArea), serviceArea: 1, distance: distanceScore(8, true) } },
    ])[0]).toBe("serves-farther");
  });

  it("trust separates comparable providers but can't beat a much better match", () => {
    const trusted = { verification: 1, rating: ratingScore(4.9, 40), reviewQuality: reviewQualityScore(40, 30) };
    expect(rank([{ id: "plain", v: {} }, { id: "trusted", v: trusted }])[0]).toBe("trusted");
    expect(rank([
      { id: "trusted-weak-match", v: { ...trusted, serviceRelevance: relevanceScore(0.6) } },
      { id: "exact-match", v: { serviceRelevance: 1 } },
    ])[0]).toBe("exact-match");
  });

  it("an admin's weights change the order", () => {
    const rows = [
      { id: "near-closed", v: { distance: distanceScore(0.5, true), availability: 0 } },
      { id: "far-open", v: { distance: distanceScore(9, true), availability: 1 } },
    ];
    expect(rank(rows, { ...DEFAULT_WEIGHTS, distance: 10, availability: 0 })[0]).toBe("near-closed");
    expect(rank(rows, { ...DEFAULT_WEIGHTS, distance: 0, availability: 10 })[0]).toBe("far-open");
  });

  it("ties go to the longest-listed provider, then a stable id order", () => {
    const a = { id: "b", score: 0.5, publishedAt: new Date("2026-02-01") };
    const b = { id: "a", score: 0.5, publishedAt: new Date("2026-01-01") };
    expect([a, b].sort(compareScored)[0]!.id).toBe("a");
  });
});

describe("signals", () => {
  it("rating is a Bayesian average: a few 5-stars don't beat many 4.8s; no reviews is neutral", () => {
    expect(ratingScore(5, 2)).toBeLessThan(ratingScore(4.8, 60));
    expect(ratingScore(null, 0)).toBeCloseTo(ratingScore(3.5, 10));
    expect(ratingScore(1, 30)).toBeLessThan(ratingScore(null, 0));
  });
  it("new providers are neutral on responsiveness, not punished", () => {
    expect(responseRateScore(0, 0)).toBe(0.5);
    expect(responseTimeScore(10, 2)).toBe(0.5); // too few samples
    expect(responseTimeScore(10, 3)).toBeGreaterThan(responseTimeScore(240, 3));
    expect(responseRateScore(10, 10)).toBeGreaterThan(responseRateScore(10, 2));
  });
  it("review quality rewards verified jobs and volume", () => {
    expect(reviewQualityScore(0, 0)).toBe(0);
    expect(reviewQualityScore(10, 10)).toBeGreaterThan(reviewQualityScore(10, 0));
    expect(reviewQualityScore(20, 0)).toBeGreaterThan(reviewQualityScore(2, 0));
    expect(reviewQualityScore(3, 99)).toBeLessThanOrEqual(1);
  });
  it("location, distance, availability and verification are bounded 0…1", () => {
    expect(locationScore(AreaTier.InArea)).toBeGreaterThan(locationScore(AreaTier.ServesArea));
    expect(locationScore(AreaTier.SameDistrict)).toBeGreaterThan(locationScore(AreaTier.Elsewhere));
    expect(distanceScore(0, true)).toBe(1);
    expect(distanceScore(null, false)).toBe(0.5);
    expect(availabilityScore("OPEN")).toBe(1);
    expect(availabilityScore("APPOINTMENT")).toBe(0.5);
    expect(verificationScore(2, 3)).toBeCloseTo(2 / 3);
    expect(verificationScore(null, 3)).toBe(0);
  });
  it("recent activity fades from a week to 90 days", () => {
    const now = new Date("2026-09-25T00:00:00Z");
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
    expect(recentActivityScore(daysAgo(3), now)).toBe(1);
    expect(recentActivityScore(daysAgo(45), now)).toBeGreaterThan(0);
    expect(recentActivityScore(daysAgo(120), now)).toBe(0);
    expect(recentActivityScore(null, now)).toBe(0);
  });
  it("rankScore is a weighted mean in 0…1; all-zero weights score 0", () => {
    const all1 = Object.fromEntries(SIGNALS.map((s) => [s, 1])) as SignalValues;
    expect(rankScore(all1, DEFAULT_WEIGHTS).score).toBeCloseTo(1);
    const zero = Object.fromEntries(SIGNALS.map((s) => [s, 0])) as Weights;
    expect(rankScore(all1, zero).score).toBe(0);
  });
});

describe("weights validation", () => {
  it("accepts whole numbers 0–10 for exactly the known signals", () => {
    expect(weightsSchema.safeParse(DEFAULT_WEIGHTS).success).toBe(true);
    expect(weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, rating: 11 }).success).toBe(false);
    expect(weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, rating: 2.5 }).success).toBe(false);
    expect(weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, rating: -1 }).success).toBe(false);
  });
  it("relevance can't be switched off", () => {
    expect(weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, serviceRelevance: 0 }).error?.issues[0]?.message).toBe("weightInvalid");
  });
  it("no paid or unknown signal can be weighted (ADR-040)", () => {
    expect(weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, featured: 10 }).success).toBe(false);
    expect(weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, paid: 10 }).success).toBe(false);
    expect(sanitizeWeights({ ...DEFAULT_WEIGHTS, featured: 10 })).not.toHaveProperty("featured");
  });
  it("stored weights that are corrupt fall back to defaults per signal", () => {
    expect(sanitizeWeights({ rating: "9", distance: 7, serviceRelevance: 0 })).toEqual({ ...DEFAULT_WEIGHTS, distance: 7 });
    expect(sanitizeWeights(null)).toEqual(DEFAULT_WEIGHTS);
  });
});

describe("permissions and badges", () => {
  const actor = (role: "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPER_ADMIN") => ({ id: "u", role, status: "ACTIVE" as const });
  it("only admins configure ranking", () => {
    expect(can(actor("ADMIN"), "ranking:configure")).toBe(true);
    expect(can(actor("SUPER_ADMIN"), "ranking:configure")).toBe(true);
    expect(can(actor("PROVIDER"), "ranking:configure")).toBe(false);
    expect(can(actor("CUSTOMER"), "ranking:configure")).toBe(false);
  });
  it("Fast response needs a measured median within an hour", () => {
    const base = { verificationLevel: null, ratingAvg: null, ratingCount: 0, availability: { state: "UNKNOWN" as const } };
    expect(trustBadges({ ...base, medianResponseMinutes: 40 }).map((b) => b.kind)).toContain("FAST_RESPONSE");
    expect(trustBadges({ ...base, medianResponseMinutes: 90 }).map((b) => b.kind)).not.toContain("FAST_RESPONSE");
    expect(trustBadges({ ...base, medianResponseMinutes: null }).map((b) => b.kind)).not.toContain("FAST_RESPONSE");
  });
  it("every signal has a label and hint in both languages", () => {
    for (const locale of ["sw", "en"] as const) {
      const r = getDictionary(locale).ranking;
      for (const s of SIGNALS) {
        expect(r.signals[s].label.length).toBeGreaterThan(2);
        expect(r.signals[s].hint.length).toBeGreaterThan(10);
      }
    }
  });
});
