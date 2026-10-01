import { normalize } from "./intent";

// Automation Engine, Phase E: helping a customer write a clear request. Pure and unit-tested.
//
// The model may only re-word what the customer wrote. guardRewrite() rejects any rewrite that adds
// facts we can check mechanically — numbers (prices, quantities, dates, phone numbers) or links that
// weren't in the original — and falls back to the customer's own words. What's missing is reported
// as fixed codes; the questions shown are ours, never the model's.

export const MISSING_CODES = ["WHEN", "WHERE_DETAILS", "PHOTOS", "SIZE_QUANTITY", "BRAND_MODEL", "BUDGET"] as const;
export type MissingCode = (typeof MISSING_CODES)[number];

export const MIN_ASSIST_CHARS = 10;
export const MAX_ASSIST_CHARS = 1000;
export const MAX_REWRITE_CHARS = 600;

const numbers = (s: string) => new Set((s.match(/\d+/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, "")));
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co\.tz|tz|net|org)\b)/i;

/** The rewrite if it only re-words the original; otherwise the original (tidied). */
export function guardRewrite(original: string, rewrite: string | null | undefined): { text: string; usedRewrite: boolean } {
  const tidy = original.trim().replace(/\s+/g, " ");
  const r = (rewrite ?? "").trim();
  if (!r || r.length > MAX_REWRITE_CHARS) return { text: tidy, usedRewrite: false };
  const allowed = numbers(original);
  for (const n of numbers(r)) if (!allowed.has(n)) return { text: tidy, usedRewrite: false };
  if (LINK.test(r) && !LINK.test(original)) return { text: tidy, usedRewrite: false };
  return { text: r, usedRewrite: true };
}

const WHEN_WORDS = ["leo", "kesho", "sasa", "today", "tomorrow", "now", "asubuhi", "mchana", "jioni", "usiku", "morning", "afternoon", "evening", "weekend", "wikendi", "jumatatu", "jumanne", "jumatano", "alhamisi", "ijumaa", "jumamosi", "jumapili", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "saa"];
const WHERE_WORDS = ["nyumba", "house", "office", "ofisi", "jiko", "kitchen", "bafu", "bathroom", "chumba", "room", "ghorofa", "floor", "gate", "geti", "shop", "duka"];
const BRAND_SERVICES = ["ac-", "fridge", "car-", "phone", "computer", "auto-", "solar"];

/** Free fallback: common missing details, by simple word checks. */
export function ruleMissing(text: string, serviceSlug: string | null): MissingCode[] {
  const t = ` ${normalize(text)} `;
  const hasAny = (ws: string[]) => ws.some((w) => t.includes(` ${w} `) || t.includes(` ${w}`));
  const out: MissingCode[] = [];
  if (!hasAny(WHEN_WORDS)) out.push("WHEN");
  if (!hasAny(WHERE_WORDS)) out.push("WHERE_DETAILS");
  if (serviceSlug && BRAND_SERVICES.some((p) => serviceSlug.startsWith(p)) && !/\d/.test(text)) out.push("BRAND_MODEL");
  out.push("PHOTOS");
  return out.slice(0, 3);
}

export function cleanMissing(codes: readonly string[] | null | undefined): MissingCode[] {
  const seen = new Set<MissingCode>();
  for (const c of codes ?? []) if ((MISSING_CODES as readonly string[]).includes(c)) seen.add(c as MissingCode);
  return [...seen].slice(0, 3);
}
