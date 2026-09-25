import Link from "next/link";
import { Sparkles, Store } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { getCurrentUser } from "@/lib/session";
import { roleHome } from "@/lib/roles";
import { getSavedArea, getSavedPoint } from "@/lib/discovery/area";
import { searchHref, type SearchParams } from "@/lib/discovery/query";
import { getAreaPickerOptions } from "@/lib/data/discovery";
import { popularServices, searchProviders, topCategories } from "@/lib/services/discovery";
import { AreaPicker } from "@/components/discovery/AreaPicker";
import { LocateMe } from "@/components/discovery/LocateMe";
import { CategoryIcon } from "@/components/discovery/CategoryIcon";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { CardGrid, Section } from "@/components/discovery/Section";
import { SearchBox } from "@/components/discovery/SearchBox";
import { ButtonLink, Card } from "@/components/ui";
import { trackAppearances } from "@/lib/analytics";

const HOME_CARDS = 6;
const HOME_CATEGORIES = 8;

// Customer home (Phase 3): area, search, categories, popular services, nearby and available-now
// providers. A "Featured" section arrives with paid placements in Phase 11 — nothing is faked here.
export default async function HomePage() {
  const [{ t, locale }, user, savedAreaCookie, point] = await Promise.all([getServerDictionary(), getCurrentUser(), getSavedArea(), getSavedPoint()]);
  // A shared position and a chosen area are mutually exclusive; the position wins if both exist.
  const savedArea = point ? null : savedAreaCookie;
  const base: SearchParams = { q: "", area: savedArea, category: null, service: null, openNow: false, priced: false, page: 1, view: "list" };

  const [districts, categories, popular, nearby, openNow] = await Promise.all([
    getAreaPickerOptions(),
    topCategories(),
    popularServices(),
    searchProviders(base, undefined, point),
    searchProviders({ ...base, openNow: true }, undefined, point),
  ]);
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const areaName = nearby.area?.name ?? null;
  await trackAppearances([...nearby.results, ...openNow.results].map((r) => r.id), "HOME");
  const noProviders = nearby.total === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <section className="-mx-4 -mt-6 bg-brand-900 px-4 pt-6 pb-8 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-8 sm:py-10">
        {user && <p className="mb-2 text-sm text-brand-100">{fill(t.home.welcomeBack, { name: user.name })}</p>}
        <h1 className="text-2xl leading-tight font-black tracking-tight sm:text-4xl">{t.home.heroTitle}</h1>
        <div className="mt-5 flex flex-col gap-2 text-ink">
          <SearchBox t={t} keep={{ area: savedArea }} />
          <AreaPicker districts={districts} value={savedArea} />
        </div>
        <Link href="/ask" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-400 underline">
          <Sparkles aria-hidden className="size-4" />
          {t.ai.homeLink}
        </Link>
        <div className="mt-2">
          <LocateMe active={!!point} areaName={nearby.areaFromPosition ? (nearby.area?.name ?? null) : null} onDark />
        </div>
        {!user && (
          <Link href="/signup?role=provider" className="mt-4 inline-block text-sm font-semibold text-accent-400 underline">
            {t.home.ctaProvider} →
          </Link>
        )}
        {user && user.role !== "CUSTOMER" && (
          <Link href={roleHome(user.role)} className="mt-4 inline-block text-sm font-semibold text-accent-400 underline">
            {user.role === "PROVIDER" ? t.nav.dashboard : t.nav.overview} →
          </Link>
        )}
      </section>

      <Section title={t.discovery.categories} href="/categories" linkLabel={t.discovery.seeAll}>
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {categories.slice(0, HOME_CATEGORIES).map((c) => (
            <li key={c.slug}>
              <Link href={`/c/${c.slug}`} className="flex h-full flex-col items-center gap-1.5 rounded-2xl p-2 text-center text-xs font-medium hover:bg-surface">
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                  <CategoryIcon name={c.icon} className="size-6" />
                </span>
                <span className="line-clamp-2">{name(c)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {popular.length > 0 && (
        <Section title={t.discovery.popularServices}>
          <ul className="flex flex-wrap gap-2">
            {popular.map((s) => (
              <li key={s.slug}>
                <Link href={searchHref(base, { service: s.slug })} className="flex min-h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-brand-500">
                  {name(s)}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {noProviders ? (
        <Card className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-400/20 text-accent-500">
            <Store aria-hidden className="size-6" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold">{t.discovery.noProvidersYetTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t.discovery.noProvidersYetBody}</p>
          </div>
          {!user && <ButtonLink href="/signup?role=provider">{t.discovery.listBusiness}</ButtonLink>}
        </Card>
      ) : (
        <>
          <Section
            title={areaName ? fill(t.discovery.nearby, { area: areaName }) : t.discovery.nearbyNoArea}
            href={searchHref(base)}
            linkLabel={t.discovery.seeAll}
          >
            <CardGrid>
              {nearby.results.slice(0, HOME_CARDS).map((p) => (
                <ProviderCard key={p.id} p={p} t={t} locale={locale} />
              ))}
            </CardGrid>
          </Section>

          {openNow.total > 0 && (
            <Section title={t.discovery.availableNow} href={searchHref(base, { openNow: true })} linkLabel={t.discovery.seeAll}>
              <CardGrid>
                {openNow.results.slice(0, HOME_CARDS).map((p) => (
                  <ProviderCard key={p.id} p={p} t={t} locale={locale} />
                ))}
              </CardGrid>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
