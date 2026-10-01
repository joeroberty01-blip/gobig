import { describe, expect, it } from "vitest";
import { cleanMissing, guardRewrite, ruleMissing } from "@/lib/ai/assist";
import { AI_MODEL, _test } from "@/lib/ai/claude";
import { matchReasons } from "@/lib/discovery/reasons";
import { AreaTier } from "@/lib/discovery/query";
import type { ProviderCard } from "@/lib/services/discovery";

describe("help-me-write guard: the model may only re-word", () => {
  const original = "Bomba la jikoni linavuja tangu jana, maji yanamwagika sakafuni. Nina mabomba 2.";

  it("accepts a clearer wording of the same facts", () => {
    const r = guardRewrite(original, "Bomba la jikoni linavuja tangu jana na maji yanamwagika sakafuni. Kuna mabomba 2.");
    expect(r.usedRewrite).toBe(true);
  });

  it("rejects added prices, quantities, phone numbers or links — and keeps the customer's words", () => {
    for (const invented of [
      "Bomba linavuja. Bajeti ni TSh 50,000.",
      "Mabomba 3 yanavuja jikoni.",
      "Bomba linavuja, nipigie 0712 345 678.",
      "Bomba linavuja, angalia www.example.com",
    ]) {
      const r = guardRewrite(original, invented);
      expect(r).toEqual({ text: original, usedRewrite: false });
    }
  });

  it("falls back on empty or overlong output", () => {
    expect(guardRewrite(original, "").usedRewrite).toBe(false);
    expect(guardRewrite(original, "a".repeat(700)).usedRewrite).toBe(false);
  });
});

describe("missing details", () => {
  it("free rules spot the usual gaps", () => {
    expect(ruleMissing("Bomba linavuja", "pipe-leak-repair")).toEqual(expect.arrayContaining(["WHEN", "WHERE_DETAILS"]));
    expect(ruleMissing("AC haipozi kabisa leo nyumbani", "ac-repair")).toEqual(expect.arrayContaining(["BRAND_MODEL"]));
    expect(ruleMissing("AC haipozi kabisa leo nyumbani", "ac-repair")).not.toContain("WHEN");
  });

  it("only our fixed codes pass through, at most three", () => {
    expect(cleanMissing(["WHEN", "HACK", "PHOTOS", "WHEN", "BUDGET", "SIZE_QUANTITY"])).toEqual(["WHEN", "PHOTOS", "BUDGET"]);
  });
});

describe("AI setup", () => {
  it("uses the current default model and a closed output schema", () => {
    expect(AI_MODEL).toBe("claude-opus-5-5");
    expect(_test.rewriteSchema.safeParse({ description: "x", missing: ["WHEN"] }).success).toBe(true);
    expect(_test.rewriteSchema.safeParse({ description: "x", missing: ["PRICE"] }).success).toBe(false);
    expect(_test.REWRITE_PROMPT).toMatch(/Use only facts the customer stated/);
  });
});

describe("why this match", () => {
  const card = (over: Partial<ProviderCard>): ProviderCard => ({
    id: "p",
    slug: "p",
    demo: false,
    name: "Biz",
    logoUrl: null,
    coverUrl: null,
    category: null,
    area: null,
    service: { nameEn: "AC repair", nameSw: "Kutengeneza AC" },
    price: null,
    availability: { state: "UNKNOWN" },
    actions: [],
    tier: null,
    distance: null,
    mapPoint: null,
    rating: { avg: null, count: 0 },
    badges: [],
    ...over,
  });

  it("states only what the card shows, most relevant first, at most three", () => {
    const r = matchReasons(
      card({ tier: AreaTier.InArea, availability: { state: "OPEN", closesAt: 1000 }, badges: [{ kind: "VERIFIED", level: { nameEn: "x", nameSw: "x" } }, { kind: "TOP_RATED" }] }),
      { service: true, area: true },
    );
    expect(r.map((x) => x.code)).toEqual(["SERVICE", "IN_AREA", "OPEN_NOW"]);
  });

  it("says nothing it can't back up", () => {
    expect(matchReasons(card({ service: null }), { service: true, area: true })).toEqual([]);
    expect(matchReasons(card({ price: { priceType: "ON_QUOTE", priceMin: null, priceMax: null, priceUnit: null } }), { service: false, area: false })).toEqual([]);
  });

  it("near-you only for the customer's own position, within 3 km", () => {
    expect(matchReasons(card({ distance: { km: 1.24, precision: "exact", from: "you" } }), { service: false, area: false })).toEqual([{ code: "NEAR", km: 1.2 }]);
    expect(matchReasons(card({ distance: { km: 1.2, precision: "exact", from: "area" } }), { service: false, area: false })).toEqual([]);
    expect(matchReasons(card({ distance: { km: 8, precision: "exact", from: "you" } }), { service: false, area: false })).toEqual([]);
  });
});
