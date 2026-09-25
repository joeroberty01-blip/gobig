import { z } from "zod";
import { darToday } from "@/lib/validators/requests";

// Phase 11 inputs. Money is whole TSh. Error messages are dictionary.errors keys.

const e = (key: string) => ({ error: key });
const id = z.string().min(1).max(40);
const optionalId = id.nullable().optional().or(z.literal("")).transform((v) => (v ? v : null));
const tzs = (max = 100_000_000) =>
  z.union([z.number(), z.string()]).transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(String(v).replace(/[\s,]/g, ""));
    if (!Number.isInteger(n) || n < 0 || n > max) {
      ctx.addIssue({ code: "custom", message: "priceInvalid" });
      return z.NEVER;
    }
    return n;
  });
const optionalTzs = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => (v === "" || v == null ? null : v))
  .pipe(tzs().nullable());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, e("dateInvalid")).transform((v, ctx) => {
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    ctx.addIssue({ code: "custom", message: "dateInvalid" });
    return z.NEVER;
  }
  return d;
});
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const planSchema = z.object({
  planId: id,
  nameEn: text(2, 40),
  nameSw: text(2, 40),
  descriptionEn: text(5, 400),
  descriptionSw: text(5, 400),
  priceTzs: optionalTzs,
  periodDays: z.number().int().min(1).max(366),
  galleryLimit: z.number().int().min(1).max(60),
  leadsPerMonth: z.union([z.number().int().min(0).max(10_000), z.null()]),
  priorityVerificationReview: z.boolean(),
  allowsCampaigns: z.boolean(),
  isActive: z.boolean(),
});

export const settingsSchema = z.object({
  paidLeadsEnabled: z.boolean(),
  featuredSlots: z.number().int().min(0).max(5),
  paymentInstructionsEn: z.string().trim().max(600).transform((v) => v || null),
  paymentInstructionsSw: z.string().trim().max(600).transform((v) => v || null),
});

export const PAYMENT_METHODS = ["MPESA", "TIGO_PESA", "AIRTEL_MONEY", "HALOPESA", "BANK_TRANSFER", "CASH", "OTHER"] as const;

export const paymentSchema = z.object({
  targetId: id,
  amountTzs: tzs().refine((n) => n > 0, e("priceInvalid")),
  method: z.enum(PAYMENT_METHODS),
  // Mobile-money / bank references: letters, digits, dashes. Upper-cased so the same code can't be recorded twice.
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,60}$/, e("referenceInvalid")),
  paidAt: date.refine((d) => d.getTime() <= darToday().getTime() + 86_400_000, e("dateInvalid")),
});

export const campaignRequestSchema = z
  .object({
    kind: z.enum(["FEATURED_SEARCH", "SPONSORED_CATEGORY"]),
    serviceId: optionalId,
    categoryId: optionalId,
    locationId: optionalId,
    startsAt: date,
    endsAt: date,
  })
  .refine((c) => c.endsAt >= c.startsAt, { message: "campaignInvalid", path: ["endsAt"] })
  .refine((c) => c.kind !== "SPONSORED_CATEGORY" || !!c.categoryId, { message: "campaignInvalid", path: ["categoryId"] });

export const campaignActionSchema = z.object({
  campaignId: id,
  action: z.enum(["approve", "reject", "pause", "resume", "end"]),
  priceTzs: optionalTzs,
  note: z.string().trim().max(300).optional(),
});

export const reasonSchema = z.object({ id, reason: text(3, 300) });
