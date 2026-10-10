import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, MapPin, Search, SearchX, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { searchHref } from "@/lib/discovery/query";
import { getSavedPoint } from "@/lib/discovery/area";
import { aiSearch, loadCatalog } from "@/lib/services/aiSearch";
import { topCategories } from "@/lib/services/discovery";
import { MAX_QUERY_CHARS } from "@/lib/ai/intent";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { Alert, ButtonLink, Card, EmptyState } from "@/components/ui";
import { trackAppearances } from "@/lib/analytics";
import { matchReasons } from "@/lib/discovery/reasons";
import { recommendProviders } from "@/lib/services/aiRecommend";
import type { Recommendation } from "@/lib/ai/recommend";
import { reasonText } from "@/lib/ai/reasonText";
import { aiAllowed } from "@/lib/services/aiAllow";
import { LocateMe } from "@/components/discovery/LocateMe";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  // Like search results, these pages aren't for search engines (and may contain personal text).
  return { title: t.ai.title, robots: { index: false } };
}

export default async function AskPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = sp.q;
  // Area chosen in the home hero's dropdown; aiSearch checks it against the real list of areas.
  const pickedArea = typeof sp.area === "string" && /^[a-z0-9-]{1,60}$/.test(sp.area) ? sp.area : null;
  const q = (typeof raw === "string" ? raw : "").trim().replace(/\s+/g, " ");
  const tooLong = q.length > MAX_QUERY_CHARS;
  const { t, locale } = await getServerDictionary();
  const a = t.ai;
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);

  const point = await getSavedPoint();
  const useAi = q && !tooLong ? await aiAllowed() : false;
  const result = q && !tooLong ? await aiSearch(q, point, new Date(), { useAi, area: pickedArea }) : null;
  const recommendation = result?.search && result.search.total > 0 ? await recommendProviders(q, result.intent, result.search.results, { useAi }) : null;
  const [catalog, categories] = await Promise.all([loadCatalog(), result?.intent.clarify?.reason === "SERVICE_UNKNOWN" ? topCategories() : []]);
  const serviceOf = new Map(catalog.services.map((s) => [s.slug, s]));
  const categoryOf = new Map(catalog.categories.map((c) => [c.slug, c]));
  const areaOf = new Map(catalog.areas.map((x) => [x.slug, x]));

  const intent = result?.intent;
  const search = result?.search ?? null;
  if (search) await trackAppearances(search.results.slice(0, 10).map((r) => r.id), "AI_SEARCH", search.filterIds);
  const filters = intent ? { service: intent.service, category: intent.service ? null : intent.category, area: intent.area } : null;
  const requestHref = intent
    ? `/requests/new?${new URLSearchParams(
        Object.entries({ service: intent.service, category: intent.service ? null : intent.category, area: intent.area }).filter((e): e is [string, string] => !!e[1]),
      )}`
    : "/requests/new";

  return (
    <div className="mx-auto max-w-5xl">
      {/* Reference design: a light page — the question, the search box, and what the AI understood. */}
      <section>
        <h1 className="max-w-[13ch] text-[2rem] leading-[1.1] font-extrabold tracking-tight sm:max-w-none sm:text-4xl">{t.ui.ask.findExactly}</h1>
        {!q && <p className="mt-2 max-w-xl text-sm text-ink-muted">{a.intro}</p>}
        {/* Plain GET form: works before JavaScript loads, like the main search box. */}
        <form action="/ask" method="get" role="search" className="relative mt-5">
          {pickedArea && <input type="hidden" name="area" value={pickedArea} />}
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-subtle" />
          <input
            type="search"
            name="q"
            defaultValue={tooLong ? "" : q}
            placeholder={a.placeholder}
            aria-label={a.placeholder}
            maxLength={MAX_QUERY_CHARS}
            autoFocus={!q}
            enterKeyHint="search"
            className="block min-h-14 w-full rounded-2xl border border-transparent bg-surface pr-16 pl-12 text-base text-ink shadow-soft placeholder:text-ink-subtle focus:border-link focus:outline-2 focus:outline-link/30"
          />
          <button type="submit" aria-label={a.ask} className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-cta text-white transition hover:bg-cta-hover active:scale-95">
            <Search aria-hidden className="size-5" />
          </button>
        </form>
        {!q && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>{a.examplesLabel}</span>
            {a.examples.map((ex) => (
              <Link key={ex} href={`/ask?${new URLSearchParams({ q: ex })}`} className="rounded-full border border-line bg-surface px-3 py-1.5 text-ink transition hover:border-link/40">
                {ex}
              </Link>
            ))}
          </div>
        )}
        {q && !tooLong && intent && (
          <div className="mt-4 rounded-2xl p-4" style={{ background: "color-mix(in oklab, var(--color-link) 8%, var(--color-surface))" }}>
            <h2 id="understood" className="flex items-center gap-1.5 text-sm font-semibold text-link">
              <Sparkles aria-hidden className="size-4" />
              {t.ui.ask.understoodRequest}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {intent.service && serviceOf.get(intent.service) && <Chip label={a.service} value={name(serviceOf.get(intent.service)!)} />}
              {!intent.service && intent.category && categoryOf.get(intent.category) && <Chip label={a.category} value={name(categoryOf.get(intent.category)!)} />}
              <Chip label={a.area} value={intent.area ? (areaOf.get(intent.area)?.name ?? a.anyArea) : a.anyArea} />
              <Chip label="" value={a.timing[intent.timing]} />
              {intent.urgency === "EMERGENCY" && <Chip label="" value={a.urgency.EMERGENCY} tone="urgent" />}
            </ul>
            {filters && (filters.service || filters.category) && (
              <Link href={searchHref(filters)} className="mt-3 inline-block text-xs font-semibold text-link underline underline-offset-4">
                {a.change}
              </Link>
            )}
          </div>
        )}
      </section>

      {tooLong && (
        <div className="mt-4">
          <Alert>{a.tooLong}</Alert>
        </div>
      )}

      {intent && (
        <section aria-label={t.ui.ask.bestMatches} className="mt-6">
          {intent.clarify && (
            <Card className="mt-4">
              <p className="font-semibold">{intent.clarify.reason === "SERVICE_AMBIGUOUS" ? a.clarifyAmbiguous : a.clarifyUnknown}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {intent.clarify.options
                  .map((slug) => serviceOf.get(slug))
                  .filter((s) => !!s)
                  .map((s) => (
                    <ButtonLink key={s!.slug} href={searchHref({ service: s!.slug, area: intent.area })} variant="secondary" className="min-h-10">
                      {name(s!)}
                    </ButtonLink>
                  ))}
                {intent.clarify.reason === "SERVICE_UNKNOWN" &&
                  categories.slice(0, 8).map((c) => (
                    <ButtonLink key={c.slug} href={`/c/${c.slug}`} variant="secondary" className="min-h-10">
                      {name(c)}
                    </ButtonLink>
                  ))}
              </div>
            </Card>
          )}

          {filters && (filters.service || filters.category) && !intent.area && !point && (
            <Card className="mt-4 flex flex-col gap-3">
              <div>
                <p className="flex items-center gap-1.5 font-semibold">
                  <MapPin aria-hidden className="size-4 text-link" />
                  {a.whereTitle}
                </p>
                <p className="text-sm text-ink-muted">{a.whereHint}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_AREAS.map((slug) => areaOf.get(slug))
                  .filter((x) => !!x)
                  .map((x) => (
                    <ButtonLink key={x!.slug} href={searchHref({ ...filters, area: x!.slug })} variant="secondary" className="min-h-9">
                      {x!.name}
                    </ButtonLink>
                  ))}
              </div>
              <LocateMe active={false} areaName={null} />
            </Card>
          )}

          {(intent.urgency === "EMERGENCY" || intent.timing === "NOW") && search && search.total > 0 && (
            <div className="mt-4">
              <Alert tone="info">
                {a.urgentNote}{" "}
                {filters && (
                  <Link href={searchHref({ ...filters, openNow: true })} className="font-semibold underline">
                    {a.openNowOnly}
                  </Link>
                )}
              </Alert>
            </div>
          )}

          {search && (
            <div className="mt-5">
              {search.total === 0 ? (
                <EmptyState icon={<SearchX aria-hidden />} title={a.noResults} />
              ) : (
                <>
                  {recommendation && recommendation.picks.length > 0 && <Recommends rec={recommendation} t={t} />}
                  <h2 className="mb-3 text-lg font-bold tracking-tight">{t.ui.ask.matching}</h2>
                  {filters && (
                    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
                      <span className="flex min-h-9 shrink-0 items-center rounded-full bg-action px-4 text-[13px] font-semibold text-white">{t.ui.search.bestMatch}</span>
                      <Link href={searchHref({ ...filters, openNow: true })} className="flex min-h-9 shrink-0 items-center rounded-full border border-line bg-surface px-4 text-[13px] font-medium">
                        {t.ui.home.availableNow}
                      </Link>
                      <Link href={searchHref({ ...filters, sort: "top" })} className="flex min-h-9 shrink-0 items-center rounded-full border border-line bg-surface px-4 text-[13px] font-medium">
                        {t.ui.home.topRated}
                      </Link>
                      <Link href={searchHref(filters)} className="ml-auto flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] font-medium">
                        <SlidersHorizontal aria-hidden className="size-4" />
                        {t.ui.search.filtersTitle}
                      </Link>
                    </div>
                  )}
                  <ul className="grid gap-3 lg:grid-cols-2">
                    {search.results.slice(0, 10).map((p, i) => (
                      <li key={p.id} className="min-w-0 animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                        <ProviderCard
                          p={p}
                          t={t}
                          locale={locale}
                          originArea={search.origin?.kind === "area" ? (search.area?.name ?? null) : null}
                          variant="row"
                          requestHref={`/requests/new?provider=${encodeURIComponent(p.slug)}`}
                        />
                        <WhyThisMatch reasons={matchReasons(p, { service: !!filters?.service || !!filters?.category, area: !!intent.area })} title={a.whyTitle} text={a.reasons} />
                      </li>
                    ))}
                  </ul>
                  {search.total > 10 && filters && (
                    <div className="mt-4 text-center">
                      <ButtonLink href={searchHref(filters)} variant="secondary">
                        {fill(a.seeAll, { count: search.total })}
                      </ButtonLink>
                    </div>
                  )}
                </>
              )}
              <p className="mt-3 text-xs text-ink-subtle">{a.rulesNote}</p>
            </div>
          )}

          <div className="mt-6">
            <ButtonLink href={requestHref} variant="accent">
              {a.postRequest}
            </ButtonLink>
          </div>
        </section>
      )}
    </div>
  );
}

/** Areas offered first when we have to ask where (largest demand in Dar). */
const POPULAR_AREAS = ["kariakoo", "sinza", "mikocheni", "kinondoni", "masaki", "mbezi", "kimara", "tegeta"];

/** Phase E: explanation built only from facts on the card (lib/discovery/reasons.ts). */
/** Go Big AI's picks: real businesses from the results, each with reasons checked against its facts. */
function Recommends({ rec, t }: { rec: Recommendation; t: Awaited<ReturnType<typeof getServerDictionary>>["t"] }) {
  const a = t.ai;
  return (
    <section aria-labelledby="ai-picks" className="mb-6 rounded-3xl bg-gradient-to-br from-[#eef4ff] to-surface p-4 ring-1 ring-action/15 sm:p-5">
      <h2 id="ai-picks" className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <span className="grid size-8 place-items-center rounded-full bg-action text-white">
          <Sparkles aria-hidden className="size-4" />
        </span>
        {a.recommendTitle}
      </h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {rec.picks.map(({ card, reasons }, i) => (
          <li key={card.id}>
            <Link href={`/p/${card.slug}`} className="flex h-full flex-col rounded-2xl bg-surface p-3 shadow-soft ring-1 ring-line/60 transition hover:shadow-lift">
              <span className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-action/10 text-xs font-bold text-action">{i + 1}</span>
                <span className="line-clamp-1 font-semibold">{card.name}</span>
              </span>
              <ul className="mt-2 space-y-1">
                {reasons.map((r) => (
                  <li key={r.code} className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <CheckCircle2 aria-hidden className="size-3.5 shrink-0 text-success" />
                    {reasonText(r, a.reasons)}
                  </li>
                ))}
              </ul>
              <span className="mt-auto pt-2 text-xs font-semibold text-action">{a.viewProfile} →</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-ink-subtle">{rec.source === "ai" ? a.recommendAiNote : a.recommendRulesNote}</p>
    </section>
  );
}

function WhyThisMatch({ reasons, title, text }: { reasons: ReturnType<typeof matchReasons>; title: string; text: Record<string, string> }) {
  if (!reasons.length) return null;
  return (
    <div className="mt-1.5 px-1" aria-label={title}>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {reasons.map((r) => (
          <li key={r.code} className="flex items-center gap-1 text-[11px] font-medium text-ink-muted">
            <CheckCircle2 aria-hidden className="size-3 text-success" />
            {r.code === "NEAR" ? fill(text.NEAR!, { km: r.km.toFixed(1) }) : text[r.code]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "urgent" }) {
  return (
    <li
      className={`inline-flex min-h-9 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold ${
        tone === "urgent" ? "bg-cta/15 text-cta" : "bg-surface text-ink shadow-soft"
      }`}
    >
      {tone === "urgent" && <Zap aria-hidden className="size-3.5" />}
      {label && <span className="sr-only">{label}: </span>}
      {value}
    </li>
  );
}
