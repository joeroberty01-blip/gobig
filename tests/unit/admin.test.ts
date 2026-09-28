import { describe, expect, it } from "vitest";
import { announcementSchema, categorySchema, fileReportSchema, locationSchema, platformSettingsSchema, serviceSchema, userStatusSchema } from "@/lib/validators/admin";
import { can } from "@/lib/permissions";
import { oneOf, pageParam, qs } from "@/components/admin/platform/Bits";
import { getDictionary } from "@/lib/i18n/dictionaries";

describe("admin inputs", () => {
  it("status changes need a written reason", () => {
    expect(userStatusSchema.safeParse({ id: "u1", status: "SUSPENDED", reason: "" }).success).toBe(false);
    expect(userStatusSchema.safeParse({ id: "u1", status: "BANNED", reason: "spam" }).success).toBe(false);
    expect(userStatusSchema.safeParse({ id: "u1", status: "SUSPENDED", reason: "spam requests" }).success).toBe(true);
  });
  it("service keywords are split, trimmed, de-duplicated and capped", () => {
    const s = serviceSchema.parse({ id: null, categoryId: "c1", nameEn: "AC repair", nameSw: "Kutengeneza AC", keywords: " fundi AC, aircon ,fundi AC,, kiyoyozi ", sortOrder: 0, isActive: true });
    expect(s.keywords).toEqual(["fundi AC", "aircon", "kiyoyozi"]);
    const many = Array.from({ length: 21 }, (_, i) => `k${i}`).join(",");
    expect(serviceSchema.safeParse({ id: null, categoryId: "c1", nameEn: "AC", nameSw: "AC", keywords: many, sortOrder: 0, isActive: true }).success).toBe(false);
  });
  it("category icons are simple names; blank parent means top level", () => {
    const c = categorySchema.parse({ id: null, nameEn: "Garden", nameSw: "Bustani", icon: "", sortOrder: 1, isActive: true, parentId: "" });
    expect(c).toMatchObject({ icon: null, parentId: null });
    expect(categorySchema.safeParse({ id: null, nameEn: "Garden", nameSw: "Bustani", icon: "<svg>", sortOrder: 1, isActive: true, parentId: null }).success).toBe(false);
  });
  it("coordinates are optional numbers, rounded to 6 decimals", () => {
    expect(locationSchema.parse({ id: null, parentId: "d1", name: "Mtaa", latitude: "-6.7924123456", longitude: "39.2083", isActive: true })).toMatchObject({ latitude: -6.792412, longitude: 39.2083 });
    expect(locationSchema.parse({ id: null, parentId: "d1", name: "Mtaa", latitude: "", longitude: "", isActive: true })).toMatchObject({ latitude: null, longitude: null });
    expect(locationSchema.safeParse({ id: null, parentId: "d1", name: "Mtaa", latitude: "abc", longitude: "39", isActive: true }).success).toBe(false);
  });
  it("platform limits stay in safe ranges", () => {
    const ok = { supportEmail: "", supportPhone: "", supportWhatsapp: "", maxOpenRequests: 5, maxRequestMatches: 15, requestTtlDays: 14, aiSearchEnabled: true,
      ridesEnabled: true, deliveriesEnabled: true, tripRequestTtlMin: 10, tripMaxRadiusKm: 10, tripMaxKm: 80, tripPurgeDays: 30 };
    expect(platformSettingsSchema.parse(ok)).toMatchObject({ supportEmail: null });
    expect(platformSettingsSchema.safeParse({ ...ok, maxRequestMatches: 500 }).success).toBe(false);
    expect(platformSettingsSchema.safeParse({ ...ok, requestTtlDays: 0 }).success).toBe(false);
    expect(platformSettingsSchema.safeParse({ ...ok, supportEmail: "not an email" }).success).toBe(false);
    // Phase 17: trip data is never kept past 90 days nor erased within a week; automation stays bounded.
    expect(platformSettingsSchema.safeParse({ ...ok, tripPurgeDays: 365 }).success).toBe(false);
    expect(platformSettingsSchema.safeParse({ ...ok, tripPurgeDays: 1 }).success).toBe(false);
    expect(platformSettingsSchema.safeParse({ ...ok, tripMaxRadiusKm: 500 }).success).toBe(false);

  });
  it("reports and announcements", () => {
    expect(fileReportSchema.safeParse({ targetType: "REVIEW", targetId: "x", reason: "SPAM" }).success).toBe(false);
    expect(fileReportSchema.parse({ targetType: "PROVIDER", targetId: "x", reason: "FRAUD", note: "  " }).note).toBeNull();
    expect(announcementSchema.safeParse({ titleEn: "Hi", titleSw: "Habari", bodyEn: "Body", bodySw: "Maelezo", audience: "ALL" }).success).toBe(false); // title too short
    expect(announcementSchema.safeParse({ titleEn: "Hello", titleSw: "Habari", bodyEn: "Body", bodySw: "Maelezo", audience: "ADMINS" }).success).toBe(false);
  });
});

describe("who can do what", () => {
  const a = (role: "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPER_ADMIN", status: "ACTIVE" | "SUSPENDED" = "ACTIVE") => ({ id: "u", role, status });
  it("admins run the platform; policy is super admin only", () => {
    for (const action of ["users:manage", "providers:moderate", "catalog:manage", "requests:oversee", "reports:manage", "audit:view", "analytics:platform"] as const) {
      expect(can(a("ADMIN"), action)).toBe(true);
      expect(can(a("PROVIDER"), action)).toBe(false);
      expect(can(a("CUSTOMER"), action)).toBe(false);
    }
    expect(can(a("ADMIN"), "announcements:send")).toBe(false);
    expect(can(a("SUPER_ADMIN"), "announcements:send")).toBe(true);
    expect(can(a("ADMIN"), "settings:manage")).toBe(false);
    expect(can(a("SUPER_ADMIN"), "settings:manage")).toBe(true);
  });
  it("customers and providers file reports; suspended accounts can't do anything", () => {
    expect(can(a("CUSTOMER"), "reports:file")).toBe(true);
    expect(can(a("PROVIDER"), "reports:file")).toBe(true);
    expect(can(a("ADMIN"), "reports:file")).toBe(false);
    expect(can(a("SUPER_ADMIN", "SUSPENDED"), "users:manage")).toBe(false);
  });
});

describe("page helpers", () => {
  it("parse query params defensively", () => {
    expect(pageParam("3")).toBe(3);
    expect(pageParam("-1")).toBe(1);
    expect(pageParam(["2"])).toBe(1);
    expect(oneOf("ACTIVE", ["ACTIVE", "SUSPENDED"] as const)).toBe("ACTIVE");
    expect(oneOf("DROP TABLE", ["ACTIVE"] as const)).toBeNull();
    expect(qs({ q: "a b", role: null, page: 2 })).toBe("?q=a+b&page=2");
    expect(qs({})).toBe("");
  });
});

describe("translations", () => {
  it("report reasons and targets exist in both languages", () => {
    for (const locale of ["sw", "en"] as const) {
      const r = getDictionary(locale).adminPlatform.reports;
      for (const k of ["SPAM", "FAKE", "FRAUD", "OFFENSIVE", "UNSAFE", "OTHER"] as const) expect(r.reasons[k]).toBeTruthy();
      for (const k of ["PROVIDER", "REQUEST", "CONVERSATION"] as const) expect(r.targets[k]).toBeTruthy();
    }
  });
});
