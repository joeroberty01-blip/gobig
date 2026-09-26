import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Search, SearchX, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { searchHref } from "@/lib/discovery/query";
import { getSavedPoint } from "@/lib/discovery/area";
import { clientIp } from "@/lib/request";
import { VISITOR_COOKIE, VISITOR_ID_PATTERN } from "@/lib/visitor";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { aiSearch, loadCatalog } from "@/lib/services/aiSearch";
import { topCategories } from "@/lib/services/discovery";
import { MAX_QUERY_CHARS } from "@/lib/ai/intent";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { Alert, ButtonLink, Card, EmptyState } from "@/components/ui";
import { trackAppearances } from "@/lib/analytics";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  // Like search results, these pages aren't for search engines (and may contain personal text).
  return { title: t.ai.title, robots: { index: false } };
}

/** AI allowance for this visitor: over the limit, the rule-based parser answers (free). */
async function aiAllowed(): Promise<boolean> {
  const vid = (await cookies()).get(VISITOR_COOKIE)?.value;
  const ipOk = (await hit(LIMITS.aiSearchPerIp, await clientIp())).ok;
  const visitorOk = vid && VISITOR_ID_PATTERN.test(vid) ? (await hit(LIMITS.aiSearchPerVisitor, vid)).ok : true;
  return ipOk && visitorOk;
}

export default async function AskPage({ searchParams }: Props) {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().replace(/\s+/g, " ");
  const tooLong = q.length > MAX_QUERY_CHARS;
  const { t, locale } = await getServerDictionary();
  const a = t.ai;
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);

  const result = q && !tooLong ? await aiSearch(q, await getSavedPoint(), new Date(), { useAi: await aiAllowed() }) : null;
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
