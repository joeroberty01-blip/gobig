import { describe, expect, it } from "vitest";
import { formatPrice, formatTzs, minutesToTime, normalizeSocial, normalizeWebsite, slugify, timeToMinutes } from "@/lib/provider/format";
import { computeCompletion, type CompletionSnapshot } from "@/lib/provider/completion";
import { actionHref, isActionAvailable, visibleActions, type ConnectSource } from "@/lib/provider/connect";
import { nextStep, prevStep, SETUP_STEPS } from "@/lib/provider/steps";
import { contactSchema, hoursSchema, locationSchema, onlineSchema, pricingSchema, whatsappSchema } from "@/lib/validators/provider";

const labels = { askForPrice: "Ask", from: "From {amount}", perHour: "{amount} / hour" };

describe("formatPrice — never invents a price", () => {
  it("formats each type", () => {
    expect(formatTzs(25000)).toBe("TSh 25,000");
    expect(formatPrice({ priceType: "FIXED", priceMin: 25000, priceMax: null, priceUnit: "per visit" }, labels)).toBe("TSh 25,000 per visit");
    expect(formatPrice({ priceType: "FROM", priceMin: 20000, priceMax: null }, labels)).toBe("From TSh 20,000");
    expect(formatPrice({ priceType: "RANGE", priceMin: 20000, priceMax: 50000 }, labels)).toBe("TSh 20,000 – 50,000");
    expect(formatPrice({ priceType: "HOURLY", priceMin: 10000, priceMax: null }, labels)).toBe("TSh 10,000 / hour");
    expect(formatPrice({ priceType: "ON_QUOTE", priceMin: null, priceMax: null }, labels)).toBe("Ask");
  });
  it("falls back to 'ask' when an amount is missing", () => {
    expect(formatPrice({ priceType: "FIXED", priceMin: null, priceMax: null }, labels)).toBe("Ask");
    expect(formatPrice({ priceType: "RANGE", priceMin: 1000, priceMax: null }, labels)).toBe("Ask");
  });
});

describe("time helpers", () => {
  it("round-trips", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(minutesToTime(510)).toBe("08:30");
    expect(timeToMinutes("24:00")).toBe(1440);
  });
  it("rejects nonsense", () => {
    for (const s of ["25:00", "24:30", "8.30", "", "12:60"]) expect(timeToMinutes(s)).toBeNull();
  });
});

describe("links", () => {
  it("normalises websites", () => {
    expect(normalizeWebsite("example.co.tz")).toBe("https://example.co.tz/");
    expect(normalizeWebsite("http://shop.example.com/a")).toBe("http://shop.example.com/a");
    for (const bad of ["javascript:alert(1)", "ftp://x.com", "localhost", "not a url", "https://user:pw@x.com"]) {
      expect(normalizeWebsite(bad)).toBeNull();
    }
  });
  it("accepts social links only on the platform's own domain", () => {
    expect(normalizeSocial("INSTAGRAM", "@juma_ac")).toBe("https://www.instagram.com/juma_ac");
    expect(normalizeSocial("TIKTOK", "juma.ac")).toBe("https://www.tiktok.com/@juma.ac");
    expect(normalizeSocial("FACEBOOK", "facebook.com/jumaac")).toBe("https://facebook.com/jumaac");
    expect(normalizeSocial("FACEBOOK", "https://evil.com/facebook.com")).toBeNull();
    expect(normalizeSocial("INSTAGRAM", "https://instagram.com.evil.io/x")).toBeNull();
    expect(normalizeSocial("FACEBOOK", "@handle")).toBeNull(); // no handle→URL mapping for Facebook
  });
  it("slugifies names", () => {
    expect(slugify("Juma AC & Friji Services!")).toBe("juma-ac-and-friji-services");
    expect(slugify("Café Ñoño")).toBe("cafe-nono");
    expect(slugify("!!!")).toBe("provider");
  });
});

const base: CompletionSnapshot = {
  displayName: "Juma AC",
  primaryCategoryId: "c",
  serviceCount: 2,
  pricedServiceCount: 0,
  description: "We repair and service all AC brands in Dar es Salaam.",
  phone: "255712345678",
  whatsapp: null,
  website: null,
  socialCount: 0,
  primaryLocationId: "l",
  serviceAreaCount: 0,
  openingHoursMode: "SCHEDULE",
  openingHoursCount: 0,
  hasLogo: false,
  hasCover: false,
  galleryCount: 0,
  enabledActionCount: 1,
};

describe("computeCompletion", () => {
  it("scores the required minimum at 60% and allows publishing", () => {
    const c = computeCompletion(base);
    expect(c.percent).toBe(60);
    expect(c.canPublish).toBe(true);
  });
  it("reaches 100% when everything is filled", () => {
    const c = computeCompletion({
      ...base,
      pricedServiceCount: 2,
      whatsapp: "255712345678",
      website: "https://x.co",
      serviceAreaCount: 3,
      openingHoursMode: "ALWAYS_OPEN",
      hasLogo: true,
      hasCover: true,
      galleryCount: 3,
    });
    expect(c.percent).toBe(100);
  });
  it("gives partial pricing credit", () => {
    expect(computeCompletion({ ...base, pricedServiceCount: 1 }).percent).toBe(63); // 60 + 2.5, rounded
  });
  it("blocks publishing and names what's missing", () => {
    const c = computeCompletion({ ...base, description: "too short", enabledActionCount: 0, phone: null });
    expect(c.canPublish).toBe(false);
    expect(c.missingRequired).toEqual(["description", "phone", "actions"]);
  });
});

const src: ConnectSource = {
  phone: "255712345678",
  whatsapp: "255712345678",
  website: null,
  email: "a@b.co",
  addressText: "Plot 12",
  locationVisibility: "AREA_ONLY",
  areaName: "Mikocheni",
};

describe("connect actions", () => {
  it("only offers actions whose data exists", () => {
    expect(isActionAvailable("CALL", src)).toBe(true);
    expect(isActionAvailable("WEBSITE", src)).toBe(false);
    // Hidden address → no directions, even though an address is stored.
    expect(isActionAvailable("DIRECTIONS", src)).toBe(false);
    expect(isActionAvailable("DIRECTIONS", { ...src, locationVisibility: "EXACT" })).toBe(true);
  });
  it("builds links", () => {
    expect(actionHref("CALL", src)).toBe("tel:+255712345678");
    expect(actionHref("WHATSAPP", src)).toBe("https://wa.me/255712345678");
    expect(actionHref("DIRECTIONS", { ...src, locationVisibility: "EXACT" })).toContain("Plot%2012%2C%20Mikocheni%2C%20Dar%20es%20Salaam");
  });
  it("shows only chosen and possible actions, in a fixed order", () => {
    expect(visibleActions(["EMAIL", "WEBSITE", "CALL"], src)).toEqual(["CALL", "EMAIL"]);
  });
});

describe("wizard order", () => {
  it("starts with the name and ends with review", () => {
    expect(SETUP_STEPS[0]).toBe("name");
    expect(SETUP_STEPS.at(-1)).toBe("review");
    expect(nextStep("review")).toBeNull();
    expect(prevStep("name")).toBeNull();
    expect(nextStep("photos")).toBe("actions");
  });
});

describe("section validators", () => {
  it("normalises contact numbers and emails", () => {
    expect(contactSchema.parse({ phone: "0712 345 678", email: "Biz@Example.com" })).toEqual({ phone: "255712345678", email: "biz@example.com" });
    expect(contactSchema.parse({ phone: "0712345678", email: "" }).email).toBeNull();
    expect(contactSchema.safeParse({ phone: "123", email: "" }).success).toBe(false);
    expect(whatsappSchema.parse({ whatsapp: "" }).whatsapp).toBeNull();
  });

  it("validates social links per platform", () => {
    const r = onlineSchema.safeParse({ website: "", social: { INSTAGRAM: "@juma", FACEBOOK: "https://evil.com" } });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["social", "FACEBOOK"]);
    const ok = onlineSchema.parse({ website: "juma.co.tz", social: { INSTAGRAM: "@juma", X: "" } });
    expect(ok).toEqual({ website: "https://juma.co.tz/", social: [{ platform: "INSTAGRAM", url: "https://www.instagram.com/juma" }] });
  });

  it("allows the three visibility levels (Phase 4) and cleans the address", () => {
    expect(locationSchema.safeParse({ locationId: "x", addressText: "", visibility: "HIDDEN" }).success).toBe(false);
    expect(locationSchema.parse({ locationId: "x", addressText: "  Plot 1 ", visibility: "EXACT" }).addressText).toBe("Plot 1");
    expect(locationSchema.parse({ locationId: "x", addressText: "  ", visibility: "AREA_ONLY" }).addressText).toBeNull();
  });

  it("checks opening hours and drops closed days", () => {
    const ok = hoursSchema.parse({
      mode: "SCHEDULE",
      note: "",
      days: [
        { day: 1, open: true, opensAt: "08:00", closesAt: "17:30" },
        { day: 7, open: false, opensAt: "08:00", closesAt: "17:30" },
      ],
    });
    expect(ok.days).toEqual([{ dayOfWeek: 1, opensAt: 480, closesAt: 1050 }, null]);
    expect(hoursSchema.safeParse({ mode: "SCHEDULE", note: "", days: [{ day: 2, open: true, opensAt: "18:00", closesAt: "08:00" }] }).success).toBe(false);
  });

  it("checks prices per type and strips unused amounts", () => {
    const parsed = pricingSchema.parse({
      items: [
        { serviceId: "a", priceType: "FIXED", priceMin: "25,000", priceMax: "99", priceUnit: "per visit" },
        { serviceId: "b", priceType: "ON_QUOTE", priceMin: "10", priceMax: "20", priceUnit: "x" },
        { serviceId: "c", priceType: "RANGE", priceMin: "20000", priceMax: "50000", priceUnit: "" },
        { serviceId: "d", priceType: "HOURLY", priceMin: 8000, priceMax: null, priceUnit: "per job" },
      ],
    });
    expect(parsed.items).toEqual([
      { serviceId: "a", priceType: "FIXED", priceMin: 25000, priceMax: null, priceUnit: "per visit" },
      { serviceId: "b", priceType: "ON_QUOTE", priceMin: null, priceMax: null, priceUnit: "x" },
      { serviceId: "c", priceType: "RANGE", priceMin: 20000, priceMax: 50000, priceUnit: null },
      { serviceId: "d", priceType: "HOURLY", priceMin: 8000, priceMax: null, priceUnit: null },
    ]);
    const bad = (item: object) => pricingSchema.safeParse({ items: [{ serviceId: "a", priceUnit: "", ...item }] }).error?.issues[0]?.message;
    expect(bad({ priceType: "FIXED", priceMin: "", priceMax: "" })).toBe("priceRequired");
    expect(bad({ priceType: "RANGE", priceMin: "50000", priceMax: "20000" })).toBe("priceRangeInvalid");
    expect(bad({ priceType: "FIXED", priceMin: "-5", priceMax: "" })).toBe("priceInvalid");
    expect(bad({ priceType: "FIXED", priceMin: "12.5", priceMax: "" })).toBe("priceInvalid");
  });
});
