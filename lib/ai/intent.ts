// AI search (Phase 9): what a customer's sentence means, as structured data only.
// Pure and unit-tested. Both extractors (Claude and the rule-based fallback) produce a SearchIntent
// whose service/category/area are slugs from OUR catalogue — never free text — so nothing the
// customer sees can be invented: providers, prices, reviews and availability come from the database.

import { extractArea } from "@/lib/discovery/query";

export const TIMINGS = ["NOW", "TODAY", "TOMORROW", "THIS_WEEK", "ANY"] as const;
export const URGENCIES = ["EMERGENCY", "SOON", "FLEXIBLE"] as const;
/** Why we need to ask. The question text is ours (translated), never written by the model. */
export const CLARIFY_REASONS = ["SERVICE_AMBIGUOUS", "SERVICE_UNKNOWN"] as const;

export type Timing = (typeof TIMINGS)[number];
export type Urgency = (typeof URGENCIES)[number];
export type ClarifyReason = (typeof CLARIFY_REASONS)[number];

export type SearchIntent = {
  service: string | null;
  category: string | null;
  area: string | null;
  timing: Timing;
  urgency: Urgency;
  /** Set when we can't tell which service is meant; options are catalogue service slugs (≤ 4). */
  clarify: { reason: ClarifyReason; options: string[] } | null;
  source: "ai" | "rules";
};

export type CatalogService = { slug: string; categorySlug: string; nameEn: string; nameSw: string; keywords: string[] };
export type CatalogCategory = { slug: string; nameEn: string; nameSw: string };
export type CatalogArea = { slug: string; name: string };
export type Catalog = { services: CatalogService[]; categories: CatalogCategory[]; areas: CatalogArea[] };

export const MAX_QUERY_CHARS = 300;
export const MAX_OPTIONS = 4;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const hasPhrase = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

// ─── Timing & urgency (Swahili + English) ───────────────────────────────────────────────────

const NOW_WORDS = ["now", "right now", "immediately", "asap", "sasa", "sasa hivi", "hivi sasa", "mara moja"];
const TODAY_WORDS = ["today", "tonight", "this evening", "this afternoon", "this morning", "leo", "usiku huu", "jioni hii", "mchana huu", "asubuhi hii"];
const TOMORROW_WORDS = ["tomorrow", "kesho"];
const WEEK_WORDS = ["this week", "weekend", "this weekend", "wiki hii", "wikendi", "mwisho wa wiki"];
const EMERGENCY_WORDS = ["emergency", "urgent", "urgently", "asap", "immediately", "dharura", "haraka sana", "haraka", "mara moja"];

export function detectTiming(text: string): Timing {
  const t = normalize(text);
  const any = (ws: string[]) => ws.some((w) => hasPhrase(t, w));
  if (any(NOW_WORDS)) return "NOW";
  if (any(TODAY_WORDS)) return "TODAY";
  if (any(TOMORROW_WORDS)) return "TOMORROW";
  if (any(WEEK_WORDS)) return "THIS_WEEK";
  return "ANY";
}

export function detectUrgency(text: string, timing: Timing): Urgency {
  const t = normalize(text);
  if (EMERGENCY_WORDS.some((w) => hasPhrase(t, w))) return "EMERGENCY";
  return timing === "NOW" || timing === "TODAY" ? "SOON" : "FLEXIBLE";
}

// ─── Service matching against the catalogue ────────────────────────────────────────────────

/** Words that describe the kind of work, not the trade: they break ties but never match alone. */
const GENERIC = new Set([
  "fundi", "repair", "repairs", "service", "services", "servicing", "installation", "install", "fix", "fixing",
  "huduma", "kutengeneza", "kurekebisha", "kufunga", "kusafisha", "kuhudumia", "and", "na", "ya", "wa", "za", "la", "cha", "&",
  "making", "hire", "cleaning", "maintenance", "matengenezo",
]);

const STOP = new Set([
  "i", "need", "want", "looking", "for", "a", "an", "the", "my", "in", "at", "to", "please", "someone", "who", "can", "is", "it", "me", "of", "on",
  "nahitaji", "natafuta", "nataka", "naomba", "mtu", "wa", "ya", "katika", "huko", "kwa", "hapa", "tafadhali", "anayeweza", "ni", "yangu", "wangu",
]);

function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
      rowMin = Math.min(rowMin, prev[j]!);
    }
    if (rowMin > max) return false;
  }
  return prev[b.length]! <= max;
}

/** Exact word, or a typo for words of 5+ letters ("plumbr" → "plumber"). */
function wordMatch(textWords: string[], w: string): 0 | 1 | 2 {
  if (textWords.includes(w)) return 2;
  if (w.length >= 5 && textWords.some((t) => t.length >= 4 && editDistanceWithin(t, w, w.length >= 8 ? 2 : 1))) return 1;
  return 0;
}

/** Score of one catalogue phrase against the text: every specific word must be present. */
function phraseScore(textWords: string[], phrase: string): number {
  const words = normalize(phrase).split(" ").filter(Boolean);
  const specific = words.filter((w) => !GENERIC.has(w));
  if (!specific.length) return 0;
  let exact = 0;
  for (const w of specific) {
    const m = wordMatch(textWords, w);
    if (!m) return 0;
    if (m === 2) exact++;
  }
  const base = exact === specific.length ? 1 : 0.85;
  // Generic words shared with the text ("AC *repair*") break ties between sibling services.
  const genericBonus = words.filter((w) => GENERIC.has(w) && textWords.includes(w)).length * 0.05;
  return base + Math.min(0.1, specific.length * 0.02) + genericBonus;
}

export type ServiceMatch = { slug: string; categorySlug: string; score: number };

export function matchCatalog(text: string, catalog: Catalog): { services: ServiceMatch[]; category: string | null } {
  const words = normalize(text).split(" ").filter((w) => w && !STOP.has(w));
  const services = catalog.services
    .map((s) => ({
      slug: s.slug,
      categorySlug: s.categorySlug,
      score: Math.max(...[s.nameEn, s.nameSw, ...s.keywords].map((p) => phraseScore(words, p))),
    }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  const category =
    catalog.categories
      .map((c) => ({ slug: c.slug, score: Math.max(phraseScore(words, c.nameEn), phraseScore(words, c.nameSw)) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.slug ?? null;
  return { services, category };
}

/**
 * Rule-based extractor: used when no AI key is configured, when the AI call fails, and as the
 * reference behaviour in tests. Deterministic; reads only the catalogue.
 */
export function ruleIntent(query: string, catalog: Catalog): SearchIntent {
  const text = query.slice(0, MAX_QUERY_CHARS);
  const { q: withoutArea, area } = extractArea(text, catalog.areas);
  const timing = detectTiming(text);
  const urgency = detectUrgency(text, timing);
  const { services, category } = matchCatalog(withoutArea, catalog);

  const base = { area, timing, urgency, source: "rules" as const };
  const best = services[0];
  if (!best) {
    return category
      ? { ...base, service: null, category, clarify: null }
      : { ...base, service: null, category: null, clarify: { reason: "SERVICE_UNKNOWN", options: [] } };
  }
  const tied = services.filter((s) => best.score - s.score < 0.04);
  if (tied.length > 1) {
    const sameCategory = tied.every((s) => s.categorySlug === best.categorySlug);
    return {
      ...base,
      service: null,
      // Siblings in one category ("air conditioner" → repair or installation): search the category
      // meanwhile, and ask which one.
      category: sameCategory ? best.categorySlug : category,
      clarify: { reason: "SERVICE_AMBIGUOUS", options: tied.slice(0, MAX_OPTIONS).map((s) => s.slug) },
    };
  }
  return { ...base, service: best.slug, category: null, clarify: null };
}

/**
 * Drops anything an extractor returned that isn't in the catalogue, so a bad or manipulated
 * answer can only ever narrow the search to real services and areas, or nothing.
 */
export function sanitizeIntent(intent: SearchIntent, catalog: Catalog): SearchIntent {
  const services = new Set(catalog.services.map((s) => s.slug));
  const categories = new Set(catalog.categories.map((c) => c.slug));
  const areas = new Set(catalog.areas.map((a) => a.slug));
  const service = intent.service && services.has(intent.service) ? intent.service : null;
  const options = [...new Set((intent.clarify?.options ?? []).filter((o) => services.has(o)))].slice(0, MAX_OPTIONS);
  return {
    service,
    category: !service && intent.category && categories.has(intent.category) ? intent.category : null,
    area: intent.area && areas.has(intent.area) ? intent.area : null,
    timing: TIMINGS.includes(intent.timing) ? intent.timing : "ANY",
    urgency: URGENCIES.includes(intent.urgency) ? intent.urgency : "FLEXIBLE",
    clarify:
      !service && intent.clarify && CLARIFY_REASONS.includes(intent.clarify.reason)
        ? { reason: options.length ? intent.clarify.reason : "SERVICE_UNKNOWN", options }
        : null,
    source: intent.source,
  };
}
