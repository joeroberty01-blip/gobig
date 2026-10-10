import Link from "next/link";
import type { Metadata } from "next";
import { List, Map as MapIcon, SearchX } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { searchHref } from "@/lib/discovery/query";
import { DAR_CENTER } from "@/lib/geo";
import { getAreaPickerOptions, resolveSearchParams } from "@/lib/data/discovery";
import { providerCardsByIds, searchProviders, topCategories, type ProviderCard as Card } from "@/lib/services/discovery";
import { FilterBar } from "@/components/discovery/FilterBar";
import { LocateMe } from "@/components/discovery/LocateMe";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { SearchBox } from "@/components/discovery/SearchBox";
import { MapView, type MapMarker } from "@/components/map/MapView";
import { Alert, ButtonLink, EmptyState } from "@/components/ui";
import { trackAppearances } from "@/lib/analytics";
import { sponsoredFor } from "@/lib/services/billing";
import { SponsoredResults } from "@/components/monetization/Sponsored";
import { DeskWhatsApp } from "@/components/support/DeskWhatsApp";
import { getPlatformSettings } from "@/lib/services/platformSettings";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { t } = await getServerDictionary();
  const q = (await resolveSearchParams(await searchParams)).params.q;
  // Result pages are not indexed; provider profiles are the pages search engines should list.
  return { title: q ? `${q} · ${t.discovery.search}` : t.discovery.search, robots: { index: false } };
}

/**
 * Map markers from public points only. Providers who show just their area share that area's
 * centre, so they are grouped into one marker instead of stacking — and nobody's home is marked.
 */
function toMarkers(results: Card[], t: Dictionary, locale: "sw" | "en"): MapMarker[] {
  const byKey = new Map<string, MapMarker & { names: string[] }>();
  for (const r of results) {
    if (!r.mapPoint) continue;
    const key = r.mapPoint.precision === "area" ? `area:${r.mapPoint.lat},${r.mapPoint.lng}` : r.id;
    const existing = byKey.get(key);
    if (existing) {
      existing.names.push(r.name);
      continue;
    }
    const service = r.service ?? r.category;
    byKey.set(key, {
      id: key,
      ...r.mapPoint,
      label: r.name,
      sublabel: service ? (locale === "sw" ? service.nameSw : service.nameEn) : undefined,
      href: `/p/${r.slug}`,
      names: [r.name],
    });
  }
  return [...byKey.values()].map(({ names, ...m }) =>
    names.length > 1
      ? { ...m, label: fill(t.location.providersHere, { count: names.length }), sublabel: names.join(", "), href: undefined }
      : m,
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const { params, effective, point } = await resolveSearchParams(await searchParams);
  const [{ t, locale }, districts, categories, result, platform] = await Promise.all([
    getServerDictionary(),
    getAreaPickerOptions(),
    topCategories(),
    searchProviders(effective, undefined, point),
    getPlatformSettings(),
  ]);
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  // Phase 10: the providers this person was shown (this page of the list, or the map).
  // Phase 11: labelled Sponsored slots on the first page of the list only, from providers that
  // already match this search. The ranked results below are unchanged.
  const sponsored =
    params.view !== "map" && result.page === 1
      ? await providerCardsByIds(
          await sponsoredFor({ kind: "FEATURED_SEARCH", candidateIds: result.rankedIds, serviceId: result.filterIds.serviceId, categoryIds: result.categoryIds, locationIds: result.areaIds }),
        )
      : [];
  await trackAppearances([...sponsored, ...result.results].map((r) => r.id), "SEARCH", result.filterIds);
  // The picker shows the chosen area; a position-derived area isn't a choice, so it stays empty.
  const areaSlug = result.areaFromPosition ? null : (result.area?.slug ?? null);
  // Links keep the area that is actually applied (a detected one included).
  const current = { ...params, area: params.area ?? areaSlug ?? null };
  const originArea = result.origin?.kind === "area" ? (result.area?.name ?? null) : null;
  const isMap = params.view === "map";

  const heading = [
    result.total === 1 ? t.discovery.resultsCountOne : fill(t.discovery.resultsCount, { count: result.total }),
    result.effectiveQuery ? fill(t.discovery.resultsFor, { q: result.effectiveQuery }) : result.serviceName ? name(result.serviceName) : result.categoryName ? name(result.categoryName) : null,
    result.area && !result.areaFromPosition ? fill(t.discovery.resultsIn, { area: result.area.name }) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const toggle = (view: "list" | "map", Icon: typeof List, label: string) => (
    <Link
      href={searchHref(current, { view, page: 1 })}
      aria-current={params.view === view ? "page" : undefined}
      className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition ${params.view === view ? "bg-action text-white shadow-soft" : "text-ink-muted hover:text-ink"}`}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-3">
        <SearchBox
          t={t}
          defaultValue={result.detectedArea ? result.effectiveQuery : params.q}
          keep={{
            area: current.area,
            category: params.category,
            service: params.service,
            open: params.openNow ? "1" : null,
            priced: params.priced ? "1" : null,
            verified: params.verified ? "1" : null,
            sort: params.sort === "top" ? "top" : null,
            view: isMap ? "map" : null,
          }}
          autoFocus={!params.q && !params.category && !params.service}
        />
        <FilterBar params={params} areaSlug={areaSlug} districts={districts} categories={categories} />
        {!params.area && <LocateMe active={!!point} areaName={result.areaFromPosition ? (result.area?.name ?? null) : null} />}
      </div>

      {result.detectedArea && result.area && (
        <div className="mt-4">
          <Alert tone="info">
            {fill(t.discovery.areaDetected, { area: result.area.name })}{" "}
            <Link href={searchHref({ ...params, q: result.effectiveQuery, area: "all", page: 1 })} className="font-semibold underline">
              {t.discovery.searchEverywhere}
            </Link>
          </Alert>
        </div>
      )}

      <div className="mt-5 mb-3 flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-base font-bold tracking-tight sm:text-lg" aria-live="polite">
          {heading}
        </h1>
        <nav className="flex shrink-0 rounded-xl bg-surface p-1 ring-1 ring-line" aria-label={`${t.location.list} / ${t.location.map}`}>
          {toggle("list", List, t.location.list)}
          {toggle("map", MapIcon, t.location.map)}
        </nav>
      </div>

      {result.total === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden />}
          title={t.discovery.noResultsTitle}
          body={t.discovery.noResultsBody}
          action={
            <>
              {(result.area || point) && (
                <ButtonLink href={searchHref({ ...params, area: "all", page: 1 })} variant="secondary">
                  {t.discovery.searchEverywhere}
                </ButtonLink>
              )}
              <ButtonLink href="/categories" variant="secondary">
                {t.discovery.browseCategories}
              </ButtonLink>
              <ButtonLink href={`/ask${params.q ? `?q=${encodeURIComponent(params.q)}` : ""}`} variant="night">
                {t.ui.home.askButton}
              </ButtonLink>
              {/* Design wave 2: a person can still help when search can't. */}
              <DeskWhatsApp number={platform.supportWhatsapp} locale={locale} query={params.q} />
            </>
          }
        />
      ) : isMap ? (
        <div className="flex flex-col gap-2">
          <MapView
            center={result.origin?.point ?? DAR_CENTER}
            markers={toMarkers(result.results, t, locale)}
            you={point}
            youLabel={t.location.you}
            fitToMarkers
            className="h-[60dvh] min-h-80"
          />
          <p className="text-xs text-ink-subtle">{t.location.mapApproxLegend}</p>
        </div>
      ) : (
        <>
        <SponsoredResults cards={sponsored} t={t} locale={locale} variant="row" />
        <ul className="grid gap-3 lg:grid-cols-2">
          {result.results.map((p, i) => (
            <li key={p.id} className="min-w-0 animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <ProviderCard p={p} t={t} locale={locale} originArea={originArea} variant="row" />
            </li>
          ))}
        </ul>
        </>
      )}

      {!isMap && result.pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label={fill(t.discovery.pageOf, { page: result.page, pages: result.pages })}>
          {result.page > 1 ? (
            <Link href={searchHref(current, { page: result.page - 1 })} className="min-h-10 px-2 py-2 font-semibold text-brand-700">
              {t.discovery.previous}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-muted">{fill(t.discovery.pageOf, { page: result.page, pages: result.pages })}</span>
          {result.page < result.pages ? (
            <Link href={searchHref(current, { page: result.page + 1 })} className="min-h-10 px-2 py-2 font-semibold text-brand-700">
              {t.discovery.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
