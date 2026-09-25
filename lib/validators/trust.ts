import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/verification-types";

// Phase 5 inputs. Error messages are dictionary.errors keys. Ids are opaque strings, length-capped;
// whether the caller may touch the thing an id points at is decided in the service layer.

const e = (key: string) => ({ error: key });
const id = z.string().min(1).max(40);
const optionalNote = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const reviewSchema = z.object({
  providerId: id,
  rating: z.number().int(e("ratingRequired")).min(1, e("ratingRequired")).max(5, e("ratingRequired")),
  body: z.string().trim().min(10, e("reviewTooShort")).max(1000, e("reviewTooLong")),
});

export const responseSchema = z.object({
  reviewId: id,
  body: z.string().trim().min(2, e("responseTooShort")).max(1000, e("reviewTooLong")),
});

export const reportSchema = z.object({
  reviewId: id,
  reason: z.enum(["SPAM", "FAKE", "OFFENSIVE", "CONFLICT_OF_INTEREST", "OTHER"]),
  note: optionalNote(500),
});

export const startVerificationSchema = z.object({ levelId: id });
export const submitVerificationSchema = z.object({ requestId: id, note: optionalNote(500) });

export const decisionSchema = z.object({
  requestId: id,
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]),
  note: optionalNote(1000),
});

export const revokeSchema = z.object({ providerId: id, reason: z.string().trim().min(3, e("noteRequired")).max(500) });

export const moderationSchema = z.object({
  reviewId: id,
  action: z.enum(["HIDE", "RESTORE", "DISMISS"]),
  note: optionalNote(500),
});

export const levelSchema = z.object({
  id: id.optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, e("notAllowed")),
  nameEn: z.string().trim().min(2).max(60),
  nameSw: z.string().trim().min(2).max(60),
  descriptionEn: z.string().trim().min(5).max(400),
  descriptionSw: z.string().trim().min(5).max(400),
  rank: z.number().int().min(1).max(10),
  requiredDocuments: z.array(z.enum(DOCUMENT_TYPES as unknown as [string, ...string[]])).max(DOCUMENT_TYPES.length),
  isActive: z.boolean(),
});
