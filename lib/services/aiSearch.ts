import { prisma } from "@/lib/db";
import { invalidate, memo } from "@/lib/cache";
import type { Point } from "@/lib/geo";
import { parseSearchParams } from "@/lib/discovery/query";
import { listAreas, searchProviders, type SearchResult } from "@/lib/services/discovery";
import { aiConfigured, claudeIntent } from "@/lib/ai/claude";
import { hit as rateHit, LIMITS } from "@/lib/services/rateLimit";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { MAX_QUERY_CHARS, normalize, ruleIntent, sanitizeIntent, type Catalog, type SearchIntent } from "@/lib/ai/intent";

// AI search (Phase 9): sentence → intent (Claude, or rules without a key) → the ordinary ranked
// search. The customer's text is not stored anywhere; answers are cached in memory for a few
// minutes so repeated searches don't cost another model call.

const CATALOG_TTL_MS = 5 * 60_000;
const INTENT_TTL_MS = 10 * 60_000;
const INTENT_CACHE_MAX = 500;

const intentCache = new Map<string, { at: number; intent: SearchIntent }>();

export function loadCatalog(): Promise<Catalog> {
  // Shared reference cache (Phase 13): admin catalogue edits invalidate it.
  return memo("ref:aiCatalog", CATALOG_TTL_MS, loadCatalogFromDb);
}

async function loadCatalogFromDb(): Promise<Catalog> {
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
  // The global daily cap (SEC-036) is counted only when a model call would really happen.
  const aiOn =
    opts.useAi !== false &&
    aiConfigured() &&
    (await getPlatformSettings()).aiSearchEnabled &&
    (await rateHit(LIMITS.aiGlobalDaily, "all")).ok;
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
/**
 * `opts.area` is the area picked next to the search box (home hero). It only applies when the text
 * names no area itself, and only if it is a real area slug; anything else is ignored.
 */
export async function aiSearch(query: string, point: Point | null, now: Date = new Date(), opts: { useAi?: boolean; area?: string | null } = {}): Promise<AiSearchResult> {
  const understood = await understand(query, opts);
  const picked = !understood.area && opts.area ? (await loadCatalog()).areas.find((x) => x.slug === opts.area)?.slug : undefined;
  const intent = picked ? { ...understood, area: picked } : understood;
  if (!intent.service && !intent.category) return { intent, search: null };
  const params = { ...parseSearchParams({}), service: intent.service, category: intent.service ? null : intent.category, area: intent.area };
  return { intent, search: await searchProviders(params, now, intent.area ? null : point) };
}

export function _clearAiCaches() {
  invalidate("ref:aiCatalog");
  intentCache.clear();
}
