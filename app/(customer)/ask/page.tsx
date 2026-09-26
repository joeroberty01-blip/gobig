import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CalendarClock, MapPin, SearchX, Siren, Sparkles, Wrench } from "lucide-react";
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
      <section className="bg-hero relative overflow-hidden rounded-[2rem] px-5 py-7 text-white shadow-lift sm:px-9 sm:py-9">
        <AiOrb />
        <div className="relative max-w-2xl">
          {q && !tooLong ? (
            <>
              <h1 className="sr-only">{a.title}</h1>
              <p className="text-xs font-semibold tracking-wide text-white/55 uppercase">{t.ui.ask.youSaid}</p>
              <p className="mt-2 text-2xl leading-snug font-bold tracking-tight text-balance sm:text-3xl">
                <span aria-hidden className="text-white/40">“</span>
                {q}
                <span aria-hidden className="text-white/40">”</span>
              </p>
              {intent && (
                <div className="mt-6">
                  <h2 id="understood" className="text-xs font-semibold tracking-wide text-white/55 uppercase">
                    {t.ui.ask.understood}
                  </h2>
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {intent.service && serviceOf.get(intent.service) && (
                      <Chip icon={<Wrench aria-hidden className="size-4" />} label={a.service} value={name(serviceOf.get(intent.service)!)} />
                    )}
                    {!intent.service && intent.category && categoryOf.get(intent.category) && (
                      <Chip icon={<Wrench aria-hidden className="size-4" />} label={a.category} value={name(categoryOf.get(intent.category)!)} />
                    )}
                    <Chip icon={<MapPin aria-hidden className="size-4" />} label={a.area} value={intent.area ? (areaOf.get(intent.area)?.name ?? a.anyArea) : a.anyArea} />
                    <Chip icon={<CalendarClock aria-hidden className="size-4" />} label="" value={a.timing[intent.timing]} />
                    {intent.urgency === "EMERGENCY" && <Chip icon={<Siren aria-hidden className="size-4" />} label="" value={a.urgency.EMERGENCY} tone="danger" />}
                  </ul>
                  {filters && (filters.service || filters.category) && (
                    <Link href={searchHref(filters)} className="mt-3 inline-block text-sm font-semibold text-white/75 underline decoration-white/30 underline-offset-4 hover:text-white">
                      {a.change}
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{a.title}</h1>
              <p className="mt-2 text-white/75">{a.intro}</p>
            </>
          )}
          {/* Plain GET form: works before JavaScript loads, like the main search box. */}
          <form action="/ask" method="get" role="search" className="relative mt-6">
            <Sparkles aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-accent-500" />
            <input
              type="search"
              name="q"
              defaultValue={q && !tooLong ? "" : q}
              placeholder={a.placeholder}
              aria-label={a.placeholder}
              maxLength={MAX_QUERY_CHARS}
              autoFocus={!q}
              enterKeyHint="search"
              className="block min-h-14 w-full rounded-2xl border border-white/10 bg-surface pr-28 pl-12 text-base text-ink shadow-soft placeholder:text-ink-subtle focus:outline-2 focus:outline-accent-400"
            />
            <button type="submit" className="absolute top-1/2 right-2 min-h-10 -translate-y-1/2 rounded-xl bg-accent-400 px-4 text-sm font-bold text-night-900 transition hover:bg-accent-500 active:scale-95">
              {a.ask}
            </button>
          </form>
          {!q && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-white/65">
              <span>{a.examplesLabel}</span>
              {a.examples.map((ex) => (
                <Link key={ex} href={`/ask?${new URLSearchParams({ q: ex })}`} className="rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-white/90 transition hover:bg-white/15">
                  {ex}
                </Link>
              ))}
            </div>
          )}
        </div>
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
                  <h2 className="mb-3 text-xl font-bold tracking-tight">{t.ui.ask.bestMatches}</h2>
                  <ul className="grid gap-3 lg:grid-cols-2">
                    {search.results.slice(0, 10).map((p, i) => (
                      <li key={p.id} className="min-w-0 animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                        <ProviderCard p={p} t={t} locale={locale} originArea={search.origin?.kind === "area" ? (search.area?.name ?? null) : null} variant="row" />
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

function Chip({ icon, label, value, tone = "default" }: { icon: React.ReactNode; label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <li
      className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold animate-rise ${
        tone === "danger" ? "border-red-400/40 bg-red-500/15 text-red-200" : "border-white/15 bg-white/[0.08] text-white"
      }`}
    >
      <span className={tone === "danger" ? "text-red-300" : "text-brand-500"}>{icon}</span>
      {label && <span className="sr-only">{label}: </span>}
      {value}
    </li>
  );
}

/** Soft animated glow in the corner of the AI card — decoration only. */
function AiOrb() {
  return (
    <div aria-hidden className="pointer-events-none absolute -top-8 -right-8 size-32 opacity-60 sm:top-1/2 sm:right-8 sm:size-44 sm:-translate-y-1/2 sm:opacity-100">
      <div className="absolute inset-0 animate-pulse rounded-full bg-[conic-gradient(from_180deg,#2cc596,#38bdf8,#a78bfa,#2cc596)] opacity-40 blur-2xl" />
      <div className="absolute inset-6 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm" />
      <Sparkles className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-white/70 sm:size-10" />
    </div>
  );
}
