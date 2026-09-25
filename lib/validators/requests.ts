import { z } from "zod";

// Phase 7 inputs. Error messages are dictionary.errors keys. Whether the caller may touch the
// request/match an id points at is decided in the service layer.

const e = (key: string) => ({ error: key });
const id = z.string().min(1).max(40);
const DAY = 24 * 60 * 60 * 1000;

/** Today's date in Dar es Salaam (UTC+3, no DST), as a UTC-midnight Date. */
export function darToday(now: Date = new Date()): Date {
  const d = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, e(tooLong))
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const optionalId = id.nullable().optional().or(z.literal("")).transform((v) => (v ? v : null));

const optionalAmount = (err: string) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v, ctx) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[\s,]/g, ""));
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000_000) {
        ctx.addIssue({ code: "custom", message: err });
        return z.NEVER;
      }
      return n;
    });

/** "YYYY-MM-DD" from today (Dar) to `maxDays` ahead → UTC-midnight Date. */
const optionalDate = (maxDays: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null;
      const today = darToday();
      if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v || d < today || d.getTime() > today.getTime() + maxDays * DAY) {
        ctx.addIssue({ code: "custom", message: "dateInvalid" });
        return z.NEVER;
      }
      return d;
    });

/** "HH:MM" → minutes after midnight. */
const optionalTime = z
  .string()
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v);
    if (!m) {
      ctx.addIssue({ code: "custom", message: "timeInvalid" });
      return z.NEVER;
    }
    return +m[1]! * 60 + +m[2]!;
  });

export const requestSchema = z
  .object({
    categoryId: optionalId,
    serviceId: optionalId,
    description: z.string().trim().min(10, e("requestTooShort")).max(2000, e("requestTooLong")),
    locationId: z.string().min(1, e("locationRequired")).max(40, e("locationRequired")),
    addressText: optionalText(200, "addressTooLong"),
    preferredDate: optionalDate(60),
    preferredTime: optionalTime,
    budgetMin: optionalAmount("budgetInvalid"),
    budgetMax: optionalAmount("budgetInvalid"),
    contactPreference: z.enum(["IN_APP", "CALL", "WHATSAPP", "SMS"]),
    targetProviderSlug: z
      .string()
      .regex(/^[a-z0-9-]{1,80}$/)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .refine((r) => r.categoryId || r.serviceId, { message: "serviceRequired", path: ["categoryId"] })
  .refine((r) => r.budgetMin == null || r.budgetMax == null || r.budgetMin <= r.budgetMax, { message: "budgetInvalid", path: ["budgetMax"] });

export const quoteSchema = z.object({
  requestId: id,
  amount: optionalAmount("amountInvalid").refine((n) => n != null && n >= 1, { message: "amountInvalid" }).transform((n) => n!),
  note: optionalText(500, "descriptionTooLong"),
  validUntil: optionalDate(90),
});

export const messageSchema = z.object({
  matchId: id,
  body: z.string().trim().min(1, e("messageRequired")).max(2000, e("messageTooLong")),
});

export const requestIdSchema = z.object({ requestId: id });
export const acceptSchema = z.object({ requestId: id, providerId: id });
