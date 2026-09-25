import { describe, expect, it } from "vitest";
import { _test, effectiveSubscriptionStatus } from "@/lib/services/billing";
import { campaignRequestSchema, paymentSchema, planSchema, settingsSchema } from "@/lib/validators/billing";
import { can } from "@/lib/permissions";
import { getDictionary } from "@/lib/i18n/dictionaries";

describe("payments", () => {
  const ok = { targetId: "s1", amountTzs: "25,000", method: "MPESA", reference: " sk12ab34cd ", paidAt: "2026-09-20" };
  it("normalises amount and reference", () => {
    expect(paymentSchema.parse(ok)).toMatchObject({ amountTzs: 25_000, reference: "SK12AB34CD" });
  });
  it("rejects bad amounts, references, methods and future dates", () => {
    expect(paymentSchema.safeParse({ ...ok, amountTzs: "0" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, amountTzs: "12.5" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, reference: "no spaces allowed" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, method: "CARD" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, paidAt: "2099-01-01" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, paidAt: "2026-02-30" }).success).toBe(false);
  });
});

describe("plans and settings", () => {
  const plan = {
    planId: "p1",
    nameEn: "Pro",
    nameSw: "Pro",
    descriptionEn: "More photos.",
    descriptionSw: "Picha zaidi.",
    priceTzs: "",
    periodDays: 30,
    galleryLimit: 30,
    leadsPerMonth: null,
    priorityVerificationReview: false,
    allowsCampaigns: true,
    isActive: true,
  };
  it("a blank price means not for sale", () => {
    expect(planSchema.parse(plan).priceTzs).toBeNull();
    expect(planSchema.parse({ ...plan, priceTzs: "15,000" }).priceTzs).toBe(15_000);
    expect(planSchema.safeParse({ ...plan, priceTzs: "-1" }).success).toBe(false);
    expect(planSchema.safeParse({ ...plan, galleryLimit: 500 }).success).toBe(false);
  });
  it("featured slots are capped at 5", () => {
    expect(settingsSchema.safeParse({ paidLeadsEnabled: false, featuredSlots: 6, paymentInstructionsEn: "", paymentInstructionsSw: "" }).success).toBe(false);
    expect(settingsSchema.parse({ paidLeadsEnabled: true, featuredSlots: 2, paymentInstructionsEn: " Till 123 ", paymentInstructionsSw: "" })).toMatchObject({
      paymentInstructionsEn: "Till 123",
      paymentInstructionsSw: null,
    });
  });
});

describe("campaign requests", () => {
  const base = { kind: "FEATURED_SEARCH", serviceId: "", categoryId: "", locationId: "", startsAt: "2026-10-01", endsAt: "2026-10-31" };
  it("dates must be in order; a category page campaign needs a category", () => {
    expect(campaignRequestSchema.safeParse(base).success).toBe(true);
    expect(campaignRequestSchema.safeParse({ ...base, endsAt: "2026-09-30" }).success).toBe(false);
    expect(campaignRequestSchema.safeParse({ ...base, kind: "SPONSORED_CATEGORY" }).success).toBe(false);
    expect(campaignRequestSchema.safeParse({ ...base, kind: "SPONSORED_CATEGORY", categoryId: "c1" }).success).toBe(true);
  });
  it("campaign states only move along allowed paths", () => {
    expect(_test.TRANSITIONS.approve.from).toEqual(["REQUESTED"]);
    expect(_test.TRANSITIONS.resume.from).toEqual(["PAUSED"]);
    expect(_test.TRANSITIONS.pause.from).not.toContain("REQUESTED");
  });
});

describe("time", () => {
  it("an active subscription past its end reads as expired", () => {
    const now = new Date("2026-09-25T10:00:00Z");
    expect(effectiveSubscriptionStatus({ status: "ACTIVE", currentPeriodEnd: new Date("2026-09-25T09:59:59Z") }, now)).toBe("EXPIRED");
    expect(effectiveSubscriptionStatus({ status: "ACTIVE", currentPeriodEnd: new Date("2026-09-26T00:00:00Z") }, now)).toBe("ACTIVE");
    expect(effectiveSubscriptionStatus({ status: "PENDING_PAYMENT", currentPeriodEnd: null }, now)).toBe("PENDING_PAYMENT");
  });
  it("the lead month starts at midnight in Dar es Salaam", () => {
    expect(_test.darMonthStart(new Date("2026-10-01T02:00:00Z")).toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(_test.darMonthStart(new Date("2026-09-30T20:00:00Z")).toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });
  it("sponsored rotation is stable within a day and changes between days", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `campaign-${i}` }));
    const d1 = new Date("2026-09-25T00:00:00Z");
    const d2 = new Date("2026-09-26T00:00:00Z");
    expect(_test.rotate(items, d1)).toEqual(_test.rotate(items, d1));
    expect(_test.rotate(items, d1).map((x) => x.id)).not.toEqual(_test.rotate(items, d2).map((x) => x.id));
  });
});

describe("permissions and text", () => {
  const actor = (role: "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPER_ADMIN") => ({ id: "u", role, status: "ACTIVE" as const });
  it("prices are super-admin policy; admins run payments; providers only their own requests", () => {
    expect(can(actor("SUPER_ADMIN"), "billing:configure")).toBe(true);
    expect(can(actor("ADMIN"), "billing:configure")).toBe(false);
    expect(can(actor("ADMIN"), "billing:manage")).toBe(true);
    expect(can(actor("PROVIDER"), "billing:manage")).toBe(false);
    expect(can(actor("PROVIDER"), "billing:manage-own")).toBe(true);
    expect(can(actor("CUSTOMER"), "billing:manage-own")).toBe(false);
  });
  it("the Sponsored label exists in both languages", () => {
    expect(getDictionary("en").billing.sponsored.label).toBe("Sponsored");
    expect(getDictionary("sw").billing.sponsored.label).toBe("Tangazo");
  });
});
