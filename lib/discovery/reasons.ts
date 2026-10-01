import { AreaTier } from "@/lib/discovery/query";
import type { ProviderCard } from "@/lib/services/discovery";

// Automation Engine, Phase E: "why this match", built only from facts already on the card (the
// business's own data, its earned badges, and distances no more precise than it allows). Pure, so
// an explanation can never claim something the card doesn't show.

export type MatchReason =
  | { code: "SERVICE" }
  | { code: "IN_AREA" }
  | { code: "SERVES_AREA" }
  | { code: "NEAR"; km: number }
  | { code: "OPEN_NOW" }
  | { code: "VERIFIED" }
  | { code: "TOP_RATED" }
  | { code: "FAST_RESPONSE" }
  | { code: "PRICE_LISTED" };

export const NEAR_KM = 3;

/** Up to `max` reasons, most relevant to the question first. */
export function matchReasons(card: ProviderCard, asked: { service: boolean; area: boolean }, max = 3): MatchReason[] {
  const out: MatchReason[] = [];
  const has = (kind: string) => card.badges.some((b) => b.kind === kind);
  if (asked.service && card.service) out.push({ code: "SERVICE" });
  if (asked.area && card.tier === AreaTier.InArea) out.push({ code: "IN_AREA" });
  else if (asked.area && card.tier === AreaTier.ServesArea) out.push({ code: "SERVES_AREA" });
  else if (card.distance && card.distance.from === "you" && card.distance.km <= NEAR_KM) out.push({ code: "NEAR", km: Math.round(card.distance.km * 10) / 10 });
  if (card.availability.state === "OPEN" || card.availability.state === "ALWAYS") out.push({ code: "OPEN_NOW" });
  if (has("VERIFIED")) out.push({ code: "VERIFIED" });
  if (has("TOP_RATED")) out.push({ code: "TOP_RATED" });
  if (has("FAST_RESPONSE")) out.push({ code: "FAST_RESPONSE" });
  if (card.price && card.price.priceType !== "ON_QUOTE") out.push({ code: "PRICE_LISTED" });
  return out.slice(0, max);
}
