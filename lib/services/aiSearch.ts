import { prisma } from "@/lib/db";
import type { Point } from "@/lib/geo";
import { parseSearchParams } from "@/lib/discovery/query";
import { listAreas, searchProviders, type SearchResult } from "@/lib/services/discovery";
import { claudeIntent } from "@/lib/ai/claude";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { MAX_QUERY_CHARS, normalize, ruleIntent, sanitizeIntent, type Catalog, type SearchIntent } from "@/lib/ai/intent";

// AI search (Phase 9): sentence → intent (Claude, or rules without a key) → the ordinary ranked
// search. The customer's text is not stored anywhere; answers are cached in memory for a few
// minutes so repeated searches don't cost another model call.

const CATALOG_TTL_MS = 5 * 60_000;
const INTENT_TTL_MS = 10 * 60_000;
const INTENT_CACHE_MAX = 500;

let catalogCache: { at: number; catalog: Catalog } | null = null;
const intentCache = new Map<string, { at: number; intent: SearchIntent }>();

export async function loadCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.catalog;
  const [services, categories, areas] = await Promise.all([
    prisma.service.findMany({
      where: { isActive: true, category: { isActive: true } },
      orderBy: { slug: "asc" },
      select: { slug: true, nameEn: true, nameSw: true, keywords: true, category: { select: { slug: true } } },
    }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { slug: "asc" }, select: { slug: true, nameEn: true, nameSw: true } }),
    listAreas(),
  ]);
  const catalog: Catalog = {
    services: services.map((s) => ({ slug: s.slug, categorySlug: s.category.slug, nameEn: s.nameEn, nameSw: s.nameSw, keywords: s.keywords })),
    categories,
    areas: areas.map((a) => ({ slug: a.slug, name: a.name })).sort((a, b) => a.slug.localeCompare(b.slug)),
  };
  catalogCache = { at: Date.now(), catalog };
  return catalog;
}

/** Sentence → validated intent. Uses Claude when configured, the rule-based parser otherwise. */
export async function understand(query: string, opts: { useAi?: boolean } = {}): Promise<SearchIntent> {
  const text = query.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_CHARS);
  const key = normalize(text);
  const hit = intentCache.get(key);
  if (hit && Date.now() - hit.at < INTENT_TTL_MS) return hit.intent;

  const catalog = await loadCatalog();
  // Admins can switch the model off in Admin → Settings; the rule-based parser then answers.
  const aiOn = opts.useAi !== false && (await getPlatformSettings()).aiSearchEnabled;
  const ai = aiOn ? await claudeIntent(text, catalog) : null;
  const intent = sanitizeIntent(ai ?? ruleIntent(text, catalog), catalog);

  if (intentCache.size >= INTENT_CACHE_MAX) intentCache.delete(intentCache.keys().next().value!);
  intentCache.set(key, { at: Date.now(), intent });
  return intent;
}

export type AiSearchResult = { intent: SearchIntent; search: SearchResult | null };

/**
 * Runs the normal search for what was understood. When we couldn't tell the service at all, no
 * search runs and the page asks instead — we never show "matches" we aren't sure of.
 */
export async function aiSearch(query: string, point: Point | null, now: Date = new Date(), opts: { useAi?: boolean } = {}): Promise<AiSearchResult> {
  const intent = await understand(query, opts);
  if (!intent.service && !intent.category) return { intent, search: null };
  const params = { ...parseSearchParams({}), service: intent.service, category: intent.service ? null : intent.category, area: intent.area };
  return { intent, search: await searchProviders(params, now, intent.area ? null : point) };
}

export function _clearAiCaches() {
  catalogCache = null;
  intentCache.clear();
}
