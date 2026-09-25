import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CalendarClock, MapPin, Siren, Sparkles, Wrench } from "lucide-react";
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
import { CardGrid } from "@/components/discovery/Section";
import { Alert, ButtonLink, Card } from "@/components/ui";
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
      <section className="rounded-3xl bg-brand-900 px-4 py-6 text-white sm:px-8">
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
          <Sparkles aria-hidden className="size-6 text-accent-400" />
          {a.title}
        </h1>
        <p className="mt-1 text-sm text-brand-100">{a.intro}</p>
        {/* Plain GET form: works before JavaScript loads, like the main search box. */}
        <form action="/ask" method="get" role="search" className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={a.placeholder}
            aria-label={a.placeholder}
            maxLength={MAX_QUERY_CHARS}
            autoFocus={!q}
            enterKeyHint="search"
            className="block min-h-13 w-full flex-1 rounded-2xl border border-line bg-surface px-4 text-base text-ink shadow-sm focus:outline-2 focus:outline-accent-400"
          />
          <button type="submit" className="min-h-13 rounded-2xl bg-accent-400 px-6 font-semibold text-brand-900 hover:bg-accent-500">
            {a.ask}
          </button>
        </form>
        {!q && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-brand-100">
            {a.examplesLabel}
            {a.examples.map((ex) => (
              <Link key={ex} href={`/ask?${new URLSearchParams({ q: ex })}`} className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20">
                {ex}
              </Link>
            ))}
          </p>
        )}
      </section>

      {tooLong && (
        <div className="mt-4">
          <Alert>{a.tooLong}</Alert>
        </div>
      )}

      {intent && (
        <section aria-labelledby="understood" className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="understood" className="text-sm font-semibold text-ink-muted">
              {a.understood}:
            </h2>
            {intent.service && serviceOf.get(intent.service) && (
              <Chip icon={<Wrench aria-hidden className="size-3.5" />} label={a.service} value={name(serviceOf.get(intent.service)!)} />
            )}
            {!intent.service && intent.category && categoryOf.get(intent.category) && (
              <Chip icon={<Wrench aria-hidden className="size-3.5" />} label={a.category} value={name(categoryOf.get(intent.category)!)} />
            )}
            <Chip icon={<MapPin aria-hidden className="size-3.5" />} label={a.area} value={intent.area ? (areaOf.get(intent.area)?.name ?? a.anyArea) : a.anyArea} />
            <Chip icon={<CalendarClock aria-hidden className="size-3.5" />} label="" value={a.timing[intent.timing]} />
            {intent.urgency === "EMERGENCY" && <Chip icon={<Siren aria-hidden className="size-3.5" />} label="" value={a.urgency.EMERGENCY} tone="danger" />}
            {filters && (filters.service || filters.category) && (
              <Link href={searchHref(filters)} className="text-sm font-semibold text-brand-700 underline">
                {a.change}
              </Link>
            )}
          </div>

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
                <Card className="text-center text-sm text-ink-muted">{a.noResults}</Card>
              ) : (
                <>
                  <CardGrid>
                    {search.results.slice(0, 10).map((p) => (
                      <ProviderCard key={p.id} p={p} t={t} locale={locale} originArea={search.origin?.kind === "area" ? (search.area?.name ?? null) : null} />
                    ))}
                  </CardGrid>
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
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${
        tone === "danger" ? "bg-danger-soft font-semibold text-danger" : "bg-brand-50 text-brand-900"
      }`}
    >
      {icon}
      {label && <span className="sr-only">{label}: </span>}
      {value}
    </span>
  );
}
