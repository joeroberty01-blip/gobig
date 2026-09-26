// Search parameters and result ordering for customer discovery (Phases 3–4). Pure, unit-tested.
// Ordering lives in lib/ranking/engine.ts (Phase 8).

export type SearchParams = {
  q: string;
  area: string | null; // Location slug
  category: string | null; // Category slug
  service: string | null; // Service slug
  openNow: boolean;
  priced: boolean;
  /** Phase 14: only providers verified by NEXA. */
  verified: boolean;
  /** Phase 14: "top" = highest rated first (the rating signal alone); default is the full ranking. */
  sort: "best" | "top";
  page: number;
  view: "list" | "map";
};

export const PAGE_SIZE = 20;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const SLUG = /^[a-z0-9-]{1,80}$/;

/** Reads URL search params defensively; anything malformed is simply ignored. */
export function parseSearchParams(raw: Record<string, string | string[] | undefined>): SearchParams {
  const slug = (k: string) => {
    const v = first(raw[k])?.trim().toLowerCase();
    return v && SLUG.test(v) ? v : null;
  };
  const page = Number.parseInt(first(raw.page) ?? "1", 10);
  return {
    q: (first(raw.q) ?? "").trim().replace(/\s+/g, " ").slice(0, 100),
    area: slug("area"),
    category: slug("category"),
    service: slug("service"),
    openNow: first(raw.open) === "1",
    priced: first(raw.priced) === "1",
    verified: first(raw.verified) === "1",
    sort: first(raw.sort) === "top" ? "top" : "best",
    page: Number.isFinite(page) && page > 0 && page < 1000 ? page : 1,
    view: first(raw.view) === "map" ? "map" : "list",
  };
}

/** Builds a /search URL, dropping empty values. `overrides` replace fields of `base`. */
export function searchHref(base: Partial<SearchParams>, overrides: Partial<SearchParams> = {}): string {
  const p = { ...base, ...overrides };
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.area) qs.set("area", p.area);
  if (p.category) qs.set("category", p.category);
  if (p.service) qs.set("service", p.service);
  if (p.openNow) qs.set("open", "1");
  if (p.priced) qs.set("priced", "1");
  if (p.verified) qs.set("verified", "1");
  if (p.sort === "top") qs.set("sort", "top");
  if (p.page && p.page > 1) qs.set("page", String(p.page));
  if (p.view === "map") qs.set("view", "map");
  const s = qs.toString();
  return s ? `/search?${s}` : "/search";
}

/**
 * Pulls a known area name out of free text, so "fundi AC Mikocheni" searches for "fundi AC" in
 * Mikocheni. Longest names are tried first ("Mbezi Beach" before "Mbezi"). Whole words only.
 */
export function extractArea(q: string, areas: { slug: string; name: string }[]): { q: string; area: string | null } {
  const sorted = [...areas].sort((a, b) => b.name.length - a.name.length);
  for (const a of sorted) {
    const escaped = a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)(in\\s+|kwa\\s+|huko\\s+)?${escaped}(?=\\s|$)`, "i");
    if (re.test(q)) {
      const rest = q.replace(re, " ").replace(/\s+/g, " ").trim();
      return { q: rest, area: a.slug };
    }
  }
  return { q, area: null };
}

/** Filler words that should not have to match ("AC repair in Mikocheni", "fundi wa bomba"). */
const STOP_WORDS = new Set(["in", "at", "near", "for", "the", "a", "an", "and", "of", "kwa", "ya", "wa", "la", "na", "za", "huko", "karibu"]);

/** At most this many words are matched separately — each costs database queries (SEC-009). */
export const MAX_QUERY_TOKENS = 6;

/** Meaningful words of a query, lower-cased. */
export function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,./]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
    .slice(0, MAX_QUERY_TOKENS);
}

/** How a provider relates to the customer's chosen area. Lower is closer. */
export enum AreaTier {
  InArea = 0, // based in the exact area
  ServesArea = 1, // travels to the area (its whole district, or within their radius)
  SameDistrict = 2, // based elsewhere in the same district
  Elsewhere = 3,
}

export type AreaContext = {
  areaId: string;
  /** District of the chosen area (itself when a district was chosen). */
  districtId: string;
  /** All areas inside the district, for "same district" checks. */
  districtAreaIds: Set<string>;
  /**
   * Service-area ids that count as "serves the customer": for a neighbourhood, the area itself or
   * its whole district; for a whole district, the district or any area inside it.
   */
  serveIds: Set<string>;
};

export function areaTier(
  p: { primaryLocationId: string | null; serviceAreaIds: string[] },
  ctx: AreaContext,
): AreaTier {
  if (p.primaryLocationId === ctx.areaId) return AreaTier.InArea;
  if (p.serviceAreaIds.some((id) => ctx.serveIds.has(id))) return AreaTier.ServesArea;
  if (p.primaryLocationId && (p.primaryLocationId === ctx.districtId || ctx.districtAreaIds.has(p.primaryLocationId))) {
    return AreaTier.SameDistrict;
  }
  return AreaTier.Elsewhere;
}
