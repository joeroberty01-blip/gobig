import { z } from "zod";

// Phase 12 admin inputs. Error messages are dictionary.errors keys.

const e = (key: string) => ({ error: key });
const id = z.string().min(1).max(40);
const reason = z.string().trim().min(3, e("noteRequired")).max(500);
const name = z.string().trim().min(2, e("nameRequired")).max(80);

export const statusChangeSchema = z.object({ id, reason });
export const userStatusSchema = z.object({ id, status: z.enum(["ACTIVE", "SUSPENDED"]), reason });
export const providerListingSchema = z.object({ id, action: z.enum(["suspend", "reinstate"]), reason });

export const categorySchema = z.object({
  id: id.nullable(),
  nameEn: name,
  nameSw: name,
  icon: z
    .string()
    .regex(/^[a-z-]{2,30}$/)
    .nullable()
    .or(z.literal("").transform(() => null)),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
  parentId: id.nullable().or(z.literal("").transform(() => null)),
});

export const serviceSchema = z.object({
  id: id.nullable(),
  categoryId: id,
  nameEn: name,
  nameSw: name,
  // Comma-separated in the form; up to 20 terms of up to 40 characters.
  keywords: z
    .string()
    .max(1000)
    .transform((v) => [...new Set(v.split(",").map((k) => k.trim().replace(/\s+/g, " ")).filter(Boolean))])
    .refine((ks) => ks.length <= 20 && ks.every((k) => k.length <= 40), e("keywordsInvalid")),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
});

const coord = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "pinOutsideArea" });
      return z.NEVER;
    }
    return Math.round(n * 1e6) / 1e6;
  });

export const locationSchema = z.object({
  id: id.nullable(),
  parentId: id,
  name,
  latitude: coord,
  longitude: coord,
  isActive: z.boolean(),
});

export const cancelRequestSchema = z.object({ id, reason });

export const fileReportSchema = z.object({
  targetType: z.enum(["PROVIDER", "REQUEST", "CONVERSATION"]),
  targetId: id,
  reason: z.enum(["SPAM", "FAKE", "FRAUD", "OFFENSIVE", "UNSAFE", "OTHER"]),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});

export const resolveReportSchema = z.object({ id, outcome: z.enum(["RESOLVED", "DISMISSED"]), resolution: reason });

export const announcementSchema = z.object({
  titleEn: z.string().trim().min(3).max(100),
  titleSw: z.string().trim().min(3).max(100),
  bodyEn: z.string().trim().min(3).max(1000),
  bodySw: z.string().trim().min(3).max(1000),
  audience: z.enum(["ALL", "CUSTOMERS", "PROVIDERS"]),
});

const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null);

export const platformSettingsSchema = z.object({
  supportEmail: optionalText(120).refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), e("emailInvalid")),
  supportPhone: optionalText(20).refine((v) => v === null || /^\+?[0-9 ]{9,16}$/.test(v), e("phoneInvalid")),
  supportWhatsapp: optionalText(20).refine((v) => v === null || /^\+?[0-9 ]{9,16}$/.test(v), e("phoneInvalid")),
  maxOpenRequests: z.number().int().min(1).max(50),
  maxRequestMatches: z.number().int().min(1).max(50),
  requestTtlDays: z.number().int().min(1).max(60),
  aiSearchEnabled: z.boolean(),
  // Phase 17
  ridesEnabled: z.boolean(),
  deliveriesEnabled: z.boolean(),
  tripRequestTtlMin: z.number().int().min(3).max(60),
  tripMaxRadiusKm: z.number().int().min(3).max(30),
  tripMaxKm: z.number().int().min(5).max(200),
  // Privacy: exact trip data is never kept longer than 90 days, nor erased before disputes can be raised.
  tripPurgeDays: z.number().int().min(7).max(90),
  driverAutoOfflineMin: z.number().int().min(5).max(240),
  autoHideReviewAtReports: z.number().int().min(0).max(50),
  requestReminderHours: z.number().int().min(0).max(72),
});
