import { describe, expect, it } from "vitest";
import { trustBadges, TOP_RATED_MIN_AVG, TOP_RATED_MIN_REVIEWS } from "@/lib/provider/trust";
import { publicReviewerName } from "@/lib/services/reviews";
import { can, type Actor } from "@/lib/permissions";
import { decisionSchema, levelSchema, reportSchema, responseSchema, reviewSchema } from "@/lib/validators/trust";
import type { Role } from "@/lib/roles";

const closed = { state: "CLOSED" as const, opensAt: null };

describe("trust badges are independent, earned signals", () => {
  it("verified comes only from a verification level", () => {
    expect(trustBadges({ verificationLevel: null, ratingAvg: 5, ratingCount: 50, availability: closed }).map((b) => b.kind)).toEqual(["TOP_RATED"]);
    expect(trustBadges({ verificationLevel: { nameEn: "ID", nameSw: "ID" }, ratingAvg: null, ratingCount: 0, availability: closed }).map((b) => b.kind)).toEqual(["VERIFIED"]);
  });
  it("top rated needs both the average and enough reviews", () => {
    const b = (avg: number, count: number) => trustBadges({ verificationLevel: null, ratingAvg: avg, ratingCount: count, availability: closed }).map((x) => x.kind);
    expect(b(TOP_RATED_MIN_AVG, TOP_RATED_MIN_REVIEWS)).toEqual(["TOP_RATED"]);
    expect(b(5, TOP_RATED_MIN_REVIEWS - 1)).toEqual([]);
    expect(b(TOP_RATED_MIN_AVG - 0.01, 100)).toEqual([]);
  });
  it("available now follows real hours; fast response never appears without data", () => {
    expect(trustBadges({ verificationLevel: null, ratingAvg: null, ratingCount: 0, availability: { state: "ALWAYS" } }).map((b) => b.kind)).toEqual(["AVAILABLE"]);
    expect(trustBadges({ verificationLevel: null, ratingAvg: null, ratingCount: 0, availability: closed }).some((b) => b.kind === "FAST_RESPONSE")).toBe(false);
  });
});

describe("reviewer privacy", () => {
  it("shows first name and last initial only", () => {
    expect(publicReviewerName("Asha Juma Mwinyi")).toBe("Asha M.");
    expect(publicReviewerName("Baraka")).toBe("Baraka");
    expect(publicReviewerName("  ")).toBe("—");
  });
});

describe("Phase 5 permissions", () => {
  const a = (role: Role): Actor => ({ id: "u", role, status: "ACTIVE" });
  it("only customers write reviews; providers reply; admins moderate", () => {
    expect(can(a("CUSTOMER"), "review:write")).toBe(true);
    for (const r of ["PROVIDER", "ADMIN", "SUPER_ADMIN"] as Role[]) expect(can(a(r), "review:write")).toBe(false);
    expect(can(a("PROVIDER"), "review:respond")).toBe(true);
    expect(can(a("CUSTOMER"), "review:respond")).toBe(false);
    expect(can(a("PROVIDER"), "reviews:moderate")).toBe(false);
    expect(can(a("ADMIN"), "reviews:moderate")).toBe(true);
  });
  it("providers request verification but can never decide it", () => {
    expect(can(a("PROVIDER"), "verification:request")).toBe(true);
    expect(can(a("PROVIDER"), "verification:review")).toBe(false);
    expect(can(a("CUSTOMER"), "verification:review")).toBe(false);
    expect(can(a("ADMIN"), "verification:review")).toBe(true);
    expect(can(a("ADMIN"), "verification:configure")).toBe(false);
    expect(can(a("SUPER_ADMIN"), "verification:configure")).toBe(true);
    expect(can({ id: "u", role: "ADMIN", status: "SUSPENDED" }, "verification:review")).toBe(false);
  });
});

describe("Phase 5 validators", () => {
  it("reviews: whole-star ratings 1–5 and a real body", () => {
    expect(reviewSchema.safeParse({ providerId: "p", rating: 5, body: "Great work, on time." }).success).toBe(true);
    for (const rating of [0, 6, 4.5, "5"]) expect(reviewSchema.safeParse({ providerId: "p", rating, body: "Great work, on time." }).success).toBe(false);
    expect(reviewSchema.safeParse({ providerId: "p", rating: 5, body: "   ok   " }).error?.issues[0]?.message).toBe("reviewTooShort");
    expect(reviewSchema.safeParse({ providerId: "p", rating: 5, body: "x".repeat(1001) }).error?.issues[0]?.message).toBe("reviewTooLong");
  });
  it("mass assignment: a review can't smuggle status or author", () => {
    const r = reviewSchema.parse({ providerId: "p", rating: 4, body: "Solid job overall.", status: "PUBLISHED", authorId: "someone", ratingAvg: 5 } as never);
    expect(Object.keys(r).sort()).toEqual(["body", "providerId", "rating"]);
  });
  it("reports need a known reason; responses and decisions are bounded", () => {
    expect(reportSchema.safeParse({ reviewId: "r", reason: "BOGUS" }).success).toBe(false);
    expect(responseSchema.safeParse({ reviewId: "r", body: "x" }).success).toBe(false);
    expect(decisionSchema.safeParse({ requestId: "r", decision: "VERIFY_ME", note: "" }).success).toBe(false);
  });
  it("levels: slug format and known document types only", () => {
    const base = { slug: "id", nameEn: "Identity", nameSw: "Utambulisho", descriptionEn: "Checks ID", descriptionSw: "Hukagua", rank: 1, requiredDocuments: ["NATIONAL_ID"], isActive: true };
    expect(levelSchema.safeParse(base).success).toBe(true);
    expect(levelSchema.safeParse({ ...base, slug: "../x" }).success).toBe(false);
    expect(levelSchema.safeParse({ ...base, requiredDocuments: ["SELFIE_WITH_CAT"] }).success).toBe(false);
  });
});
