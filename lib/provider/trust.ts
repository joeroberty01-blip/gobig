import type { Availability } from "@/lib/provider/availability";
import { isAvailableNow } from "@/lib/provider/availability";

// Trust indicators (Phase 5). Each comes from its own real signal and they never imply each other:
//   VERIFIED     — an admin approved documents (VerificationRequest). Not purchasable.
//   TOP_RATED    — published customer reviews meet the thresholds below.
//   AVAILABLE    — open right now by the provider's own hours.
//   FAST_RESPONSE — median first reply to service requests within an hour, over at least
//                   MIN_RESPONSE_SAMPLES answered requests in the last 90 days (Phase 8).
// Paid placement (Phase 11) is a separate "Featured/Sponsored" label and grants none of these.

export const TOP_RATED_MIN_AVG = 4.5;
export const TOP_RATED_MIN_REVIEWS = 5;

export type TrustBadge =
  | { kind: "VERIFIED"; level: { nameEn: string; nameSw: string } }
  | { kind: "TOP_RATED" }
  | { kind: "AVAILABLE" }
  | { kind: "FAST_RESPONSE" };

export function trustBadges(input: {
  verificationLevel: { nameEn: string; nameSw: string } | null;
  ratingAvg: number | null;
  ratingCount: number;
  availability: Availability;
  /** Median first-response minutes over recent requests; null without enough answered requests. */
  medianResponseMinutes?: number | null;
}): TrustBadge[] {
  const badges: TrustBadge[] = [];
  if (input.verificationLevel) badges.push({ kind: "VERIFIED", level: input.verificationLevel });
  if (input.ratingAvg != null && input.ratingCount >= TOP_RATED_MIN_REVIEWS && input.ratingAvg >= TOP_RATED_MIN_AVG) badges.push({ kind: "TOP_RATED" });
  if (isAvailableNow(input.availability)) badges.push({ kind: "AVAILABLE" });
  if (input.medianResponseMinutes != null && input.medianResponseMinutes <= 60) badges.push({ kind: "FAST_RESPONSE" });
  return badges;
}
