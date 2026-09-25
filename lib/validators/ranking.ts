import { z } from "zod";
import { MAX_WEIGHT, MIN_WEIGHTS, SIGNALS, type Signal } from "@/lib/ranking/engine";

// Phase 8: ranking weights from the admin form. Strict: unknown keys (e.g. a "paid" signal) are
// rejected, so nothing outside the documented organic signals can be weighted.

const weight = (s: Signal) =>
  z
    .number({ error: "weightInvalid" })
    .int({ error: "weightInvalid" })
    .min(MIN_WEIGHTS[s] ?? 0, { error: "weightInvalid" })
    .max(MAX_WEIGHT, { error: "weightInvalid" });

export const weightsSchema = z.strictObject(Object.fromEntries(SIGNALS.map((s) => [s, weight(s)])) as Record<Signal, ReturnType<typeof weight>>);

const slug = z
  .string()
  .regex(/^[a-z0-9-]{1,80}$/)
  .nullable()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export const previewSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  service: slug,
  area: slug,
  weights: weightsSchema,
});
