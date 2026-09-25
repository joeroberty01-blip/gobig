import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { MAX_PRICE_TZS, normalizeSocial, normalizeWebsite, timeToMinutes, type SocialPlatform } from "@/lib/provider/format";
import { CONNECT_ACTIONS } from "@/lib/provider/connect";
import { inServiceRegion } from "@/lib/geo";

// One schema per profile section. Error messages are dictionary.errors keys. Every schema
// normalises as it validates, so the service layer only ever receives clean values.

const e = (key: string) => ({ error: key });

const optionalTrimmed = (max: number, key: string) =>
  z
    .string()
    .trim()
    .max(max, e(key))
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const nameSchema = z.object({
  displayName: z.string().trim().min(2, e("businessNameRequired")).max(80, e("businessNameRequired")),
});

export const categorySchema = z.object({ categoryId: z.string().min(1, e("categoryRequired")).max(40) });

export const servicesSchema = z.object({
  serviceIds: z.array(z.string().min(1).max(40)).min(1, e("servicesRequired")).max(30, e("tooManyServices")),
});

export const descriptionSchema = z.object({ description: optionalTrimmed(1500, "descriptionTooLong") });

export const contactSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const p = normalizePhone(v);
      if (!p) ctx.addIssue({ code: "custom", message: "phoneInvalid" });
      return p ?? "";
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.email(e("emailInvalid")).max(254).nullable()),
});

export const whatsappSchema = z.object({
  whatsapp: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const p = normalizePhone(v);
      if (!p) ctx.addIssue({ code: "custom", message: "phoneInvalid" });
      return p;
    }),
});

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "X", "YOUTUBE", "LINKEDIN"];

export const onlineSchema = z.object({
  website: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const url = normalizeWebsite(v);
      if (!url) ctx.addIssue({ code: "custom", message: "websiteInvalid" });
      return url;
    }),
  social: z
    .partialRecord(z.enum(SOCIAL_PLATFORMS as [SocialPlatform, ...SocialPlatform[]]), z.string().max(300))
    .transform((rec, ctx) => {
      const out: { platform: SocialPlatform; url: string }[] = [];
      for (const [platform, raw] of Object.entries(rec) as [SocialPlatform, string][]) {
        if (!raw.trim()) continue;
        const url = normalizeSocial(platform, raw);
        if (!url) ctx.addIssue({ code: "custom", message: "socialInvalid", path: [platform] });
        else out.push({ platform, url });
      }
      return out;
    }),
});

const coordinate = z.number().finite().nullable().optional().transform((v) => v ?? null);

export const RADIUS_OPTIONS = [2, 5, 10, 20, 30] as const;

export const locationSchema = z
  .object({
    locationId: z.string().min(1, e("locationRequired")).max(40),
    addressText: optionalTrimmed(200, "addressTooLong"),
    visibility: z.enum(["EXACT", "APPROXIMATE", "AREA_ONLY"]),
    latitude: coordinate,
    longitude: coordinate,
    radiusKm: z
      .number()
      .int()
      .refine((v) => (RADIUS_OPTIONS as readonly number[]).includes(v), e("radiusInvalid"))
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .transform((d, ctx) => {
    const hasPin = d.latitude != null && d.longitude != null;
    if ((d.latitude == null) !== (d.longitude == null) || (hasPin && !inServiceRegion({ lat: d.latitude!, lng: d.longitude! }))) {
      ctx.addIssue({ code: "custom", message: "pinOutsideArea", path: ["latitude"] });
    }
    // Showing an exact location needs something exact to show.
    if (d.visibility === "EXACT" && !hasPin && !d.addressText) {
      ctx.addIssue({ code: "custom", message: "exactNeedsLocation", path: ["visibility"] });
    }
    // "Approximate" is derived from a pin; without one it is the same as area-only.
    const visibility = d.visibility === "APPROXIMATE" && !hasPin ? ("AREA_ONLY" as const) : d.visibility;
    // Stored to ~1 m; more digits than that are noise.
    const round = (v: number | null) => (v == null ? null : Math.round(v * 1e5) / 1e5);
    return { ...d, visibility, latitude: round(d.latitude), longitude: round(d.longitude) };
  });

export const areasSchema = z.object({
  locationIds: z.array(z.string().min(1).max(40)).max(60, e("tooManyAreas")),
});

const daySchema = z
  .object({
    day: z.number().int().min(1).max(7),
    open: z.boolean(),
    opensAt: z.string(),
    closesAt: z.string(),
  })
  .transform((d, ctx) => {
    if (!d.open) return null;
    const opensAt = timeToMinutes(d.opensAt);
    const closesAt = timeToMinutes(d.closesAt);
    if (opensAt == null || closesAt == null || opensAt >= closesAt) {
      ctx.addIssue({ code: "custom", message: "hoursInvalid", path: [d.day] });
      return null;
    }
    return { dayOfWeek: d.day, opensAt, closesAt };
  });

export const hoursSchema = z.object({
  mode: z.enum(["SCHEDULE", "ALWAYS_OPEN", "BY_APPOINTMENT"]),
  days: z.array(daySchema).max(7),
  note: optionalTrimmed(200, "hoursNoteTooLong"),
});

const amount = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    if (typeof v === "string") {
      const cleaned = v.replace(/[,\s]/g, "");
      if (cleaned === "") return null;
      v = Number(cleaned);
    }
    if (!Number.isInteger(v) || v < 0 || v > MAX_PRICE_TZS) {
      ctx.addIssue({ code: "custom", message: "priceInvalid" });
      return null;
    }
    return v;
  })
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const priceItemSchema = z
  .object({
    serviceId: z.string().min(1).max(40),
    priceType: z.enum(["FIXED", "FROM", "RANGE", "HOURLY", "ON_QUOTE"]),
    priceMin: amount,
    priceMax: amount,
    priceUnit: optionalTrimmed(40, "priceUnitTooLong"),
  })
  .transform((p, ctx) => {
    // Keep only the amounts each type uses, so stale numbers never linger in the database.
    if (p.priceType === "ON_QUOTE") return { ...p, priceMin: null, priceMax: null };
    if (p.priceMin == null) ctx.addIssue({ code: "custom", message: "priceRequired", path: ["priceMin"] });
    if (p.priceType === "RANGE") {
      if (p.priceMax == null || (p.priceMin != null && p.priceMax <= p.priceMin)) {
        ctx.addIssue({ code: "custom", message: "priceRangeInvalid", path: ["priceMax"] });
      }
      return p;
    }
    return { ...p, priceMax: null, priceUnit: p.priceType === "HOURLY" ? null : p.priceUnit };
  });

export const pricingSchema = z.object({ items: z.array(priceItemSchema).max(30) });

/** undefined = leave the saved link as it is; "" = remove it; otherwise a validated http(s) URL. */
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === "") return null;
    // Same rules as the website: http(s) only, real host, no credentials — never javascript: etc.
    const url = normalizeWebsite(v);
    if (!url) ctx.addIssue({ code: "custom", message: "websiteInvalid" });
    return url;
  });

export const actionsSchema = z.object({
  actions: z.array(z.enum(CONNECT_ACTIONS)).max(CONNECT_ACTIONS.length),
  bookingUrl: optionalUrl,
  rideUrl: optionalUrl,
});
