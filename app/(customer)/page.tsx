import Link from "next/link";
import { ArrowRight, BadgeCheck, ChevronRight, Clock, LocateFixed, Sparkles, Star, Store } from "lucide-react";
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
import { Section } from "@/components/discovery/Section";
import { SearchBox } from "@/components/discovery/SearchBox";
import { ButtonLink, EmptyState } from "@/components/ui";
import { trackAppearances } from "@/lib/analytics";

const HOME_CARDS = 8;
const HOME_CATEGORIES = 8;

// One calm tint per category tile, repeated in order. Mixed with transparency so it reads in both
// light and dark themes.
const TINTS = ["#10a37a", "#2563eb", "#7c3aed", "#e11d48", "#db2777", "#d97706", "#0891b2", "#4f46e5"];

// Customer home (Phase 3, redesigned in Phase 14): the question, search, quick filters,
// categories, and real nearby / available-now providers. Nothing is faked here.
export default async function HomePage() {
  const [{ t, locale }, user, savedAreaCookie, point] = await Promise.all([getServerDictionary(), getCurrentUser(), getSavedArea(), getSavedPoint()]);
  // A shared position and a chosen area are mutually exclusive; the position wins if both exist.
  const savedArea = point ? null : savedAreaCookie;
  const base: SearchParams = { q: "", area: savedArea, category: null, service: null, openNow: false, priced: false, verified: false, sort: "best", page: 1, view: "list" };

  const [districts, categories, popular, nearby, openNow] = await Promise.all([
    getAreaPickerOptions(),
    topCategories(),
    popularServices(),
    searchProviders(base, undefined, point),
    searchProviders({ ...base, openNow: true }, undefined, point),
  ]);
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const areaName = nearby.area?.name ?? null;
  await trackAppearances([...nearby.results.slice(0, HOME_CARDS), ...openNow.results.slice(0, HOME_CARDS)].map((r) => r.id), "HOME");
  const noProviders = nearby.total === 0;
  const h = t.ui.home;

  const quick = [
    { href: searchHref(base), label: h.nearYou, Icon: LocateFixed },
    { href: searchHref(base, { openNow: true }), label: h.availableNow, Icon: Clock },
    { href: searchHref(base, { verified: true }), label: h.verified, Icon: BadgeCheck },
    { href: searchHref(base, { sort: "top" }), label: h.topRated, Icon: Star },
  ];

  const carousel = (cards: typeof nearby.results) => (
    // Swipeable row on phones, grid from tablet up.
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {cards.slice(0, HOME_CARDS).map((p, i) => (
        <li key={p.id} className={`w-[78%] min-w-0 shrink-0 snap-start sm:w-auto ${i >= 4 ? "sm:hidden lg:block" : ""} ${i >= 6 ? "lg:hidden" : ""}`}>
          <ProviderCard p={p} t={t} locale={locale} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <section className="bg-hero relative -mx-4 -mt-6 overflow-hidden px-5 pt-8 pb-7 text-white sm:mx-0 sm:mt-0 sm:rounded-[2rem] sm:px-10 sm:pt-12 sm:pb-10">
        <Skyline />
        <div className="relative max-w-2xl">
          {user && <p className="mb-2 text-sm font-medium text-white/70">{fill(t.home.welcomeBack, { name: user.name })}</p>}
          <h1 className="text-[2.1rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl">{h.heroTitle}</h1>
          <p className="mt-3 text-base text-white/75 sm:text-lg">{h.heroSubtitle}</p>

          <div className="mt-6 flex flex-col gap-2.5">
            <SearchBox t={t} keep={{ area: savedArea }} size="lg" />
            <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
              <AreaPicker districts={districts} value={savedArea} />
              <Link
                href="/ask"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15 active:scale-[0.98]"
              >
                <Sparkles aria-hidden className="size-4 text-accent-400" />
                {h.askLink}
              </Link>
            </div>
          </div>

          <ul className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
            {quick.map(({ href, label, Icon }) => (
              <li key={label} className="shrink-0">
                <Link
                  href={href}
                  className="flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3.5 text-sm font-medium text-white/90 transition hover:bg-white/15 active:scale-[0.97]"
                >
                  <Icon aria-hidden className="size-4 text-brand-500" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <LocateMe active={!!point} areaName={nearby.areaFromPosition ? (nearby.area?.name ?? null) : null} onDark />
          </div>
          {user && user.role !== "CUSTOMER" && (
            <Link href={roleHome(user.role)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-400">
              {user.role === "PROVIDER" ? t.nav.dashboard : t.nav.overview}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>
      </section>

      <Section title={h.browse} href="/categories" linkLabel={t.discovery.seeAll}>
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-8 sm:px-0">
          {categories.slice(0, HOME_CATEGORIES).map((c, i) => {
            const tint = TINTS[i % TINTS.length]!;
            return (
              <li key={c.slug} className="w-20 shrink-0 sm:w-auto">
                <Link href={`/c/${c.slug}`} className="group flex h-full flex-col items-center gap-2 rounded-2xl p-2 text-center text-xs font-medium transition hover:bg-surface active:scale-[0.97]">
                  <span
                    className="grid size-14 place-items-center rounded-full transition group-hover:scale-105"
                    style={{ color: tint, background: `color-mix(in oklab, ${tint} 13%, transparent)` }}
                  >
                    <CategoryIcon name={c.icon} className="size-6" />
                  </span>
                  <span className="line-clamp-2 leading-tight">{name(c)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {popular.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {popular.map((s) => (
              <li key={s.slug}>
                <Link
                  href={searchHref(base, { service: s.slug })}
                  className="flex min-h-9 items-center rounded-full border border-line bg-surface px-3.5 text-sm font-medium transition hover:border-brand-500 hover:text-brand-700 active:scale-[0.97]"
                >
                  {name(s)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {noProviders ? (
        <div className="mt-10">
          <EmptyState
            icon={<Store aria-hidden />}
            title={t.discovery.noProvidersYetTitle}
            body={t.discovery.noProvidersYetBody}
            action={!user && <ButtonLink href="/signup?role=provider">{t.discovery.listBusiness}</ButtonLink>}
          />
        </div>
      ) : (
        <>
          <Section
            title={h.nearYouTitle}
            subtitle={areaName ? fill(h.nearYouIn, { area: areaName }) : h.nearYouHint}
            href={searchHref(base)}
            linkLabel={t.discovery.seeAll}
          >
            {carousel(nearby.results)}
          </Section>

          {openNow.total > 0 && (
            <Section title={t.discovery.availableNow} href={searchHref(base, { openNow: true })} linkLabel={t.discovery.seeAll}>
              {carousel(openNow.results)}
            </Section>
          )}
        </>
      )}

      {!user && !noProviders && (
        <Link
          href="/signup?role=provider"
          className="bg-hero group mt-10 flex items-center gap-4 rounded-3xl p-5 text-white shadow-lift transition hover:-translate-y-0.5 sm:p-7"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10">
            <Store aria-hidden className="size-6 text-accent-400" />
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

/** A quiet coastline-and-towers silhouette for the hero: local feel without a stock photo. */
function Skyline() {
  return (
    <svg aria-hidden viewBox="0 0 600 200" preserveAspectRatio="xMaxYMax meet" className="pointer-events-none absolute right-0 bottom-0 h-40 w-auto opacity-[0.09] sm:h-64">
      <g fill="#fff">
        <rect x="250" y="70" width="34" height="130" rx="2" />
        <rect x="290" y="30" width="40" height="170" rx="2" />
        <rect x="336" y="90" width="28" height="110" rx="2" />
        <rect x="370" y="50" width="46" height="150" rx="2" />
        <rect x="422" y="100" width="30" height="100" rx="2" />
        <rect x="458" y="20" width="36" height="180" rx="2" />
        <rect x="500" y="80" width="42" height="120" rx="2" />
        <rect x="548" y="110" width="52" height="90" rx="2" />
        <path d="M150 200c6-40 14-70 30-92-18 4-34 16-44 30 4-22 18-40 38-48-22-4-44 4-58 20 8-20 28-34 50-36-24-10-52-2-66 18 2-6 6-12 12-16l6 124z" />
        <path d="M0 200c60-18 130-24 200-18s140 18 400 18z" />
      </g>
    </svg>
  );
}
