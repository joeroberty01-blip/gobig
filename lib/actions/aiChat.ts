"use server";

import { getServerDictionary } from "@/lib/i18n/server";
import { getSavedPoint } from "@/lib/discovery/area";
import { clientIp } from "@/lib/request";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { aiAllowed } from "@/lib/services/aiAllow";
import { aiSearch, loadCatalog } from "@/lib/services/aiSearch";
import { recommendProviders } from "@/lib/services/aiRecommend";
import { topCategories } from "@/lib/services/discovery";
import { MAX_QUERY_CHARS } from "@/lib/ai/intent";
import { reasonText } from "@/lib/ai/reasonText";
import { trackAppearances } from "@/lib/analytics";

// The floating Go Big AI chat (owner, 2026-10-10): one question in, the same answer as the Go Big AI
// page out — what was understood, up to three real businesses with checked reasons, and links to see
// everything or post a request. Every sentence comes from the dictionary; the model only picks ids
// and reason codes (lib/ai/recommend.ts), so the chat can't invent a business, price or rating.

export type ChatPick = { slug: string; name: string; rating: number | null; reviews: number; area: string | null; reasons: string[]; demo: boolean };
export type ChatReply =
  | {
      ok: true;
      understood: string[];
      clarify: { text: string; options: string[] } | null;
      picks: ChatPick[];
      total: number;
      seeAllHref: string;
      requestHref: string;
      source: "ai" | "rules";
    }
  | { ok: false; error: "empty" | "tooLong" | "rateLimited" };

const AREA_SLUG = /^[a-z0-9-]{1,60}$/;

export async function askGoBigAIAction(input: { q: unknown; area?: unknown }): Promise<ChatReply> {
  const q = (typeof input.q === "string" ? input.q : "").trim().replace(/\s+/g, " ");
  if (!q) return { ok: false, error: "empty" };
  if (q.length > MAX_QUERY_CHARS) return { ok: false, error: "tooLong" };
  if (!(await hit(LIMITS.aiChatPerIp, await clientIp())).ok) return { ok: false, error: "rateLimited" };
  const area = typeof input.area === "string" && AREA_SLUG.test(input.area) ? input.area : null;

  const [{ t, locale }, point, useAi] = await Promise.all([getServerDictionary(), getSavedPoint(), aiAllowed()]);
  const a = t.ai;
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);

  const result = await aiSearch(q, point, new Date(), { useAi, area });
  const { intent, search } = result;
  const catalog = await loadCatalog();
  const service = intent.service ? catalog.services.find((s) => s.slug === intent.service) : undefined;
  const category = !service && intent.category ? catalog.categories.find((c) => c.slug === intent.category) : undefined;
  const areaRow = intent.area ? catalog.areas.find((x) => x.slug === intent.area) : undefined;

  const understood = [
    service ? name(service) : category ? name(category) : null,
    areaRow ? areaRow.name : a.anyArea,
    a.timing[intent.timing],
    intent.urgency === "EMERGENCY" ? a.urgency.EMERGENCY : null,
  ].filter((x): x is string => !!x);

  let clarify: { text: string; options: string[] } | null = null;
  if (intent.clarify?.reason === "SERVICE_AMBIGUOUS") {
    const options = intent.clarify.options.map((slug) => catalog.services.find((s) => s.slug === slug)).filter((s) => !!s).map((s) => name(s!));
    if (options.length) clarify = { text: a.clarifyAmbiguous, options };
  } else if (intent.clarify?.reason === "SERVICE_UNKNOWN" || (!service && !category)) {
    clarify = { text: a.chatUnknown, options: (await topCategories()).slice(0, 6).map(name) };
  }

  let picks: ChatPick[] = [];
  if (search && search.total > 0) {
    const rec = await recommendProviders(q, intent, search.results, { useAi });
    picks = (rec?.picks ?? []).map(({ card, reasons }) => ({
      slug: card.slug,
      name: card.name,
      rating: card.rating.avg,
      reviews: card.rating.count,
      area: card.area?.name ?? null,
      reasons: reasons.map((r) => reasonText(r, a.reasons as Record<string, string>)).filter(Boolean),
      demo: card.demo,
    }));
    await trackAppearances(
      picks.map((p) => search.results.find((r) => r.slug === p.slug)!.id),
      "AI_SEARCH",
      search.filterIds,
    );
  }

  const params = new URLSearchParams({ q, ...(area ? { area } : {}) });
  const requestParams = new URLSearchParams(
    Object.entries({ service: intent.service, category: intent.service ? null : intent.category, area: intent.area }).filter((e): e is [string, string] => !!e[1]),
  );
  return {
    ok: true,
    understood,
    clarify,
    picks,
    total: search?.total ?? 0,
    seeAllHref: `/ask?${params}`,
    requestHref: `/requests/new${requestParams.size ? `?${requestParams}` : ""}`,
    source: intent.source,
  };
}
