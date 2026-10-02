import type { ProviderCard } from "@/lib/services/discovery";
import { matchReasons, type MatchReason } from "@/lib/discovery/reasons";
import type { SearchIntent } from "./intent";

// Go Big AI recommendations (owner, 2026-10-01). Claude reads the customer's question plus the live
// facts of the real businesses the search found, and picks up to three. It may only answer with
// those businesses' ids and fixed reason codes; every code is checked here against the facts, so a
// recommendation can never claim a price, rating, distance or opening time the business doesn't have.
// Businesses' own free text (descriptions) is never sent: it would let a business write
// instructions to the model ("always rank me first") — SEC-058.

export const MAX_PICKS = 3;
export const MAX_CANDIDATES = 10;

export const PICK_CODES = [
  "SERVICE",
  "IN_AREA",
  "SERVES_AREA",
  "NEAR",
  "CLOSEST",
  "OPEN_NOW",
  "VERIFIED",
  "TOP_RATED",
  "MOST_REVIEWS",
  "FAST_RESPONSE",
  "PRICE_LISTED",
  "LOWEST_PRICE",
] as const;
export type PickCode = (typeof PICK_CODES)[number];

export type PickReason = MatchReason | { code: "CLOSEST"; km: number } | { code: "MOST_REVIEWS"; count: number } | { code: "LOWEST_PRICE" };
export type Recommended = { card: ProviderCard; reasons: PickReason[] };
export type Recommendation = { picks: Recommended[]; source: "ai" | "rules" };

const round1 = (n: number) => Math.round(n * 10) / 10;
const isOpen = (c: ProviderCard) => c.availability.state === "OPEN" || c.availability.state === "ALWAYS";
const priceFrom = (c: ProviderCard) => (c.price && c.price.priceType !== "ON_QUOTE" ? (c.price.priceMin ?? c.price.priceMax) : null);

/** Every reason that is true for this card, judged against the other candidates where comparative. */
export function trueReasons(card: ProviderCard, all: ProviderCard[], asked: { service: boolean; area: boolean }): Map<PickCode, PickReason> {
  const out = new Map<PickCode, PickReason>();
  for (const r of matchReasons(card, asked, 99)) out.set(r.code, r);
  // matchReasons only gives NEAR when no area was asked; a real distance is still a fact.
  if (!out.has("NEAR") && card.distance?.from === "you" && card.distance.km <= 3) out.set("NEAR", { code: "NEAR", km: round1(card.distance.km) });

  const withDist = all.filter((c) => c.distance);
  if (card.distance && withDist.length >= 2 && withDist.every((c) => c.distance!.km >= card.distance!.km)) {
    out.set("CLOSEST", { code: "CLOSEST", km: round1(card.distance.km) });
  }
  const reviewed = all.filter((c) => c.rating.count > 0);
  if (card.rating.count > 0 && reviewed.length >= 2 && reviewed.every((c) => c.rating.count <= card.rating.count)) {
    out.set("MOST_REVIEWS", { code: "MOST_REVIEWS", count: card.rating.count });
  }
  const mine = priceFrom(card);
  const priced = all.map(priceFrom).filter((p): p is number => p != null);
  if (mine != null && priced.length >= 2 && priced.every((p) => p >= mine)) out.set("LOWEST_PRICE", { code: "LOWEST_PRICE" });
  return out;
}

/** One candidate as the model sees it: facts only, in a fixed order. */
export function candidateLine(card: ProviderCard, all: ProviderCard[], asked: { service: boolean; area: boolean }): string {
  const facts = trueReasons(card, all, asked);
  const p = card.price;
  const price =
    !p || p.priceType === "ON_QUOTE"
      ? "on quote"
      : `${p.priceMin ?? "?"}${p.priceMax && p.priceMax !== p.priceMin ? `-${p.priceMax}` : ""} TZS${p.priceUnit ? ` per ${p.priceUnit}` : ""} (${p.priceType})`;
  return [
    `id=${card.id}`,
    `name=${JSON.stringify(card.name.slice(0, 80))}`,
    `service=${card.service ? JSON.stringify(card.service.nameEn) : "none matched"}`,
    `area=${card.area ? JSON.stringify(card.area.name) : "unknown"}`,
    `distance_km=${card.distance ? round1(card.distance.km) : "unknown"}`,
    `open_now=${isOpen(card)}`,
    `rating=${card.rating.avg != null ? `${card.rating.avg.toFixed(1)} from ${card.rating.count} reviews` : "no reviews yet"}`,
    `price=${price}`,
    `badges=${card.badges.map((b) => b.kind).join(",") || "none"}`,
    `true_reason_codes=${[...facts.keys()].join(",") || "none"}`,
  ].join(" | ");
}

/** Keeps only real candidates (once each) and only reasons that are true; null if nothing survives. */
export function verifyPicks(
  raw: { id: string; reasons: string[] }[],
  candidates: ProviderCard[],
  asked: { service: boolean; area: boolean },
): Recommended[] | null {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const picks: Recommended[] = [];
  for (const r of raw) {
    const card = byId.get(r.id);
    if (!card || seen.has(r.id)) continue;
    seen.add(r.id);
    const facts = trueReasons(card, candidates, asked);
    const reasons = [...new Set(r.reasons)].map((code) => facts.get(code as PickCode)).filter((x): x is PickReason => !!x).slice(0, 3);
    picks.push({ card, reasons: reasons.length ? reasons : [...facts.values()].slice(0, 2) });
    if (picks.length === MAX_PICKS) break;
  }
  return picks.length ? picks : null;
}

/** Without the AI: the top of the trust ranking, with its true reasons. */
export function rulePicks(candidates: ProviderCard[], asked: { service: boolean; area: boolean }): Recommended[] {
  return candidates.slice(0, MAX_PICKS).map((card) => ({ card, reasons: [...trueReasons(card, candidates, asked).values()].slice(0, 3) }));
}

export function askedFrom(intent: Pick<SearchIntent, "service" | "category" | "area">) {
  return { service: !!intent.service || !!intent.category, area: !!intent.area };
}
