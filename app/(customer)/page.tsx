import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { getCurrentUser } from "@/lib/session";
import { roleHome } from "@/lib/roles";
import { getSavedArea, getSavedPoint } from "@/lib/discovery/area";
import { searchHref, type SearchParams } from "@/lib/discovery/query";
import { searchProviders, topCategories } from "@/lib/services/discovery";
import { LocateMe } from "@/components/discovery/LocateMe";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { Section } from "@/components/discovery/Section";
import { Hero } from "@/components/home/Hero";
import { PopularServices } from "@/components/home/PopularServices";
import { AiPromo } from "@/components/home/AiPromo";
import { homeStats } from "@/lib/services/homeStats";
import { ButtonLink, EmptyState } from "@/components/ui";
import { DeskWhatsApp } from "@/components/support/DeskWhatsApp";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { trackAppearances } from "@/lib/analytics";

const HOME_CARDS = 8;
const HOME_CATEGORIES = 6;

// Customer home (owner's reference design, 2026-10-01): hero with search + area, quick filters,
// Popular Services cards, and real nearby / available-now providers. Nothing is faked here.
export default async function HomePage() {
  const [{ t, locale }, user, savedAreaCookie, point] = await Promise.all([getServerDictionary(), getCurrentUser(), getSavedArea(), getSavedPoint()]);
  // A shared position and a chosen area are mutually exclusive; the position wins if both exist.
  const savedArea = point ? null : savedAreaCookie;
  const base: SearchParams = { q: "", area: savedArea, category: null, service: null, openNow: false, priced: false, verified: false, sort: "best", page: 1, view: "list" };

  const [categories, stats, nearby, openNow, platform] = await Promise.all([
    topCategories(),
    homeStats(),
    searchProviders(base, undefined, point),
    searchProviders({ ...base, openNow: true }, undefined, point),
    getPlatformSettings(),
  ]);
  const areaName = nearby.area?.name ?? null;
  await trackAppearances([...nearby.results.slice(0, HOME_CARDS), ...openNow.results.slice(0, HOME_CARDS)].map((r) => r.id), "HOME");
  const noProviders = nearby.total === 0;
  const h = t.ui.home;

  const quick = [
    { href: searchHref(base), label: h.nearYou, icon: "near" as const },
    { href: searchHref(base, { openNow: true }), label: h.availableNow, icon: "now" as const },
    { href: searchHref(base, { verified: true }), label: h.verified, icon: "verified" as const },
    { href: searchHref(base, { sort: "top" }), label: h.topRated, icon: "top" as const },
  ];

  const list = (cards: typeof nearby.results) => (
    <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
      {cards.slice(0, 6).map((p) => (
        <li key={p.id} className="min-w-0">
          <ProviderCard p={p} t={t} locale={locale} />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mx-auto max-w-7xl">
      <Hero t={t} area={savedArea} quick={quick} stats={stats} />
      {user && user.role !== "CUSTOMER" && (
        <Link href={roleHome(user.role)} className="mt-3 flex items-center gap-1 text-sm font-semibold text-action">
          {user.role === "PROVIDER" ? t.nav.dashboard : t.nav.overview}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      )}

      <PopularServices t={t} locale={locale} categories={categories} max={HOME_CATEGORIES} />
      <AiPromo t={t} />

      <Section
        title={h.nearYouTitle}
        subtitle={areaName ? fill(h.nearYouIn, { area: areaName }) : t.ui.home.basedOnLocation}
        href={noProviders ? undefined : searchHref(base)}
        linkLabel={h.viewAll}
      >
        {!point && (
          <div className="-mt-2 mb-3">
            <LocateMe active={false} areaName={null} />
          </div>
        )}
        {noProviders ? (
          <EmptyState
            icon={<Store aria-hidden />}
            title={t.discovery.noProvidersYetTitle}
            body={t.discovery.noProvidersYetBody}
            action={
              <>
                {/* Design wave 2: until businesses join, show the ways a customer can still get help. */}
                <ButtonLink href="/ask" variant="night">
                  {t.ui.home.askButton}
                </ButtonLink>
                <DeskWhatsApp number={platform.supportWhatsapp} locale={locale} />
                {!user && (
                  <ButtonLink href="/signup?role=provider" variant="secondary">
                    {t.discovery.listBusiness}
                  </ButtonLink>
                )}
              </>
            }
          />
        ) : (
          list(nearby.results)
        )}
      </Section>

      {!noProviders && openNow.total > 0 && (
        <Section title={t.discovery.availableNow} href={searchHref(base, { openNow: true })} linkLabel={t.discovery.seeAll}>
          {list(openNow.results)}
        </Section>
      )}

      {!user && (
        <Link
          href="/signup?role=provider"
          className="group mt-10 flex items-center gap-4 rounded-3xl bg-night-900 p-5 text-white shadow-lift transition hover:-translate-y-0.5 sm:p-7 lg:hidden"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10">
            <Store aria-hidden className="size-6 text-brand-500" />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-bold">{h.listBusinessTitle}</span>
            <span className="block text-sm text-white/70">{h.listBusinessBody}</span>
          </span>
          <ChevronRight aria-hidden className="size-6 text-white/60 transition group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
