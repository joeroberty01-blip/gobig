import Image from "next/image";
import Link from "next/link";
import { ChevronRight, MapPin, ShieldCheck, Sparkles, Star, Store, Zap } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { getCurrentUser } from "@/lib/session";
import { roleHome } from "@/lib/roles";
import { getSavedArea, getSavedPoint } from "@/lib/discovery/area";
import { searchHref, type SearchParams } from "@/lib/discovery/query";
import { popularServices, searchProviders, topCategories } from "@/lib/services/discovery";
import { LocateMe } from "@/components/discovery/LocateMe";
import { CategoryIcon } from "@/components/discovery/CategoryIcon";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { Section } from "@/components/discovery/Section";
import { SearchBox } from "@/components/discovery/SearchBox";
import { ButtonLink, EmptyState } from "@/components/ui";
import { trackAppearances } from "@/lib/analytics";

const HOME_CARDS = 8;
const HOME_CATEGORIES = 8;

// One soft tint per category tile, in order (approved design). Mixed with transparency so it reads
// in both light and dark themes.
/** Hour of day in Dar es Salaam (UTC+3), for the greeting. */
function darHour(): number {
  return new Date(Date.now() + 3 * 3_600_000).getUTCHours();
}

// Customer home (approved design, 2026-09-26): the question on a light sky, search, quick filters,
// category tiles, and real nearby / available-now providers. Nothing is faked here.
export default async function HomePage() {
  const [{ t, locale }, user, savedAreaCookie, point] = await Promise.all([getServerDictionary(), getCurrentUser(), getSavedArea(), getSavedPoint()]);
  // A shared position and a chosen area are mutually exclusive; the position wins if both exist.
  const savedArea = point ? null : savedAreaCookie;
  const base: SearchParams = { q: "", area: savedArea, category: null, service: null, openNow: false, priced: false, verified: false, sort: "best", page: 1, view: "list" };

  const [categories, popular, nearby, openNow] = await Promise.all([
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
    { href: searchHref(base), label: h.nearYou, Icon: MapPin },
    { href: searchHref(base, { openNow: true }), label: h.availableNow, Icon: Zap },
    { href: searchHref(base, { verified: true }), label: h.verified, Icon: ShieldCheck },
    { href: searchHref(base, { sort: "top" }), label: h.topRated, Icon: Star },
  ];
  const hour = darHour();
  const greeting = hour < 12 ? h.morning : hour < 17 ? h.afternoon : h.evening;

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
    <div className="mx-auto max-w-6xl">
      <section className="relative -mx-4 -mt-6 overflow-hidden px-4 pt-5 pb-1 sm:mx-0 sm:mt-0 sm:rounded-[2rem] sm:px-10 sm:pt-12 sm:pb-8">
        <HeroScene />
        <div className="relative max-w-xl">
          <p className="mb-1 text-xs font-medium text-ink-muted sm:text-sm">{user ? `${greeting}, ${user.name.split(" ")[0] ?? user.name}` : greeting}</p>
          <h1 className="max-w-[12ch] text-[1.7rem] leading-[1.12] font-extrabold tracking-tight text-ink sm:max-w-none sm:text-5xl">{h.heroTitle}</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted sm:text-lg">{h.heroSubtitle}</p>

          <div className="mt-4 sm:mt-6">
            {/* Straight to the AI search: people type what they need in their own words. */}
            <SearchBox t={t} size="lg" action="/ask" placeholder={h.askPlaceholder} />
          </div>

          <ul className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:gap-2 sm:px-0">
            {quick.map(({ href, label, Icon }) => (
              <li key={label} className="shrink-0">
                <Link
                  href={href}
                  className="flex min-h-8 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-[11px] font-medium text-ink shadow-soft transition hover:border-ink-subtle/40 active:scale-[0.97] sm:min-h-9 sm:gap-1.5 sm:px-3.5 sm:text-[13px]"
                >
                  <Icon aria-hidden className="size-3 text-link sm:size-3.5" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          <Link href="/ask" className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-ink sm:mt-4 sm:text-sm">
            <Sparkles aria-hidden className="size-4 text-accent-500" />
            {h.askLink}
            <ChevronRight aria-hidden className="size-4 text-ink-subtle" />
          </Link>
          {user && user.role !== "CUSTOMER" && (
            <Link href={roleHome(user.role)} className="mt-1 flex items-center gap-1 text-sm font-semibold text-brand-700">
              {user.role === "PROVIDER" ? t.nav.dashboard : t.nav.overview}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>
      </section>

      <Section title={h.explore} href="/categories" linkLabel={h.viewAll}>
        <ul className="grid grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-8 sm:gap-x-2 sm:gap-y-4">
          {categories.slice(0, HOME_CATEGORIES).map((c) => (
            <li key={c.slug}>
              <Link href={`/c/${c.slug}`} className="group flex h-full flex-col items-center gap-1.5 text-center text-[10.5px] leading-tight font-medium transition active:scale-[0.97] sm:gap-2 sm:text-xs">
                <span className="grid size-12 place-items-center rounded-full bg-surface text-ink shadow-soft ring-1 ring-line transition group-hover:ring-link/40 sm:size-15">
                  <CategoryIcon name={c.icon} className="size-5 sm:size-6" />
                </span>
                <span className="line-clamp-2 leading-tight">{name(c)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {popular.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {popular.map((s) => (
              <li key={s.slug}>
                <Link
                  href={searchHref(base, { service: s.slug })}
                  className="flex min-h-7 items-center rounded-full border border-line bg-surface px-2.5 text-[11px] font-medium transition hover:border-ink-subtle/40 active:scale-[0.97] sm:min-h-8 sm:px-3 sm:text-xs"
                >
                  {name(s)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

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
            action={!user && <ButtonLink href="/signup?role=provider">{t.discovery.listBusiness}</ButtonLink>}
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

/**
 * The owner's photo of the Dar es Salaam waterfront behind the hero, fading into the page on the
 * left so the question stays readable (reference design).
 */
function HeroScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute top-0 right-0 h-52 w-[62%] overflow-hidden rounded-bl-[7rem] sm:h-[26rem] sm:w-[58%] sm:rounded-bl-[16rem]">
      <Image src="/hero-dar.webp" alt="" fill priority sizes="(max-width: 640px) 70vw, 60vw" className="object-cover object-right" />
      <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-canvas/70 via-transparent to-transparent" />
    </div>
  );
}
