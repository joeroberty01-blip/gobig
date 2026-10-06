import Image from "next/image";
import Link from "next/link";
import { Bot, ChevronDown, Clock, MapPin, Navigation, Search, ShieldCheck, Star, Store, Zap } from "lucide-react";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import type { HomeStats } from "@/lib/services/homeStats";
import { HeroSearchInput } from "./HeroSearchInput";

type District = { slug: string; name: string; children: { slug: string; name: string }[] };

type Quick = { href: string; label: string; icon: "near" | "now" | "verified" | "top" };

/**
 * Home hero — owner's mockups and direction (2026-10-06): the Dar es Salaam waterfront fills the WHOLE
 * hero, with a gradient over it — light on the left so the words read clearly, fading to the clear
 * photo on the right ("gradient form", not a separate photo). Badge, "Find the right help. / Right
 * around you.", subtitle, the search bar with the area inside, quick filters and the trust row.
 * The mockups' "Trusted by 10,000+" was invented; the badges show only real counts (or nothing).
 */
export function Hero({ t, districts, area, quick, stats }: { t: Dictionary; districts: District[]; area: string | null; quick: Quick[]; stats: HomeStats }) {
  const h = t.ui.home;
  const badge = stats.verified > 0 ? fill(h.verifiedCount, { count: stats.verified }) : h.badge;
  const stat =
    stats.reviews > 0 && stats.avgRating != null
      ? { Icon: Star, title: fill(h.statReviews, { avg: stats.avgRating.toFixed(1) }), sub: fill(h.statReviewsSub, { count: stats.reviews }) }
      : stats.listed > 0
        ? { Icon: Store, title: fill(h.statListed, { count: stats.listed }), sub: h.statListedSub }
        : null;

  return (
    <section>
      <div className="relative overflow-hidden rounded-[1.75rem] ring-1 ring-line/60 lg:rounded-[2rem]">
        {/* The photo behind everything… */}
        <Image src="/hero-dar.webp" alt="" fill priority sizes="(max-width: 1024px) 100vw, 1280px" className="object-cover object-[72%_center] lg:object-right" />
        {/* …and the gradient over it: page-light under the words, clear photo on the right. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#eef3ff] from-10% via-[#eef3ff]/85 via-50% to-[#eef3ff]/0 to-80% lg:from-[#f3f6ff] lg:from-20% lg:via-[#f3f6ff]/80 lg:via-45% lg:to-65%" />
        {/* A soft lift at the bottom on phones, where the search bar sits over the photo. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#eef3ff]/70 to-transparent lg:hidden" />
        {/* The blue/orange swoosh on the left edge. */}
        <svg aria-hidden viewBox="0 0 40 400" preserveAspectRatio="none" className="pointer-events-none absolute top-[24%] -left-1 h-[62%] w-5 lg:top-[18%] lg:h-[70%] lg:w-7">
          <path d="M0 0 C 34 120, 34 280, 0 400 Z" fill="#1f5ff2" />
          <path d="M0 170 C 20 240, 20 330, 0 400 Z" fill="#ff9500" />
        </svg>

        <div className="relative px-4 pt-4 pb-4 sm:px-8 sm:pt-8 sm:pb-6 lg:w-[56%] lg:px-14 lg:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/70 px-2.5 py-1 text-[10.5px] font-medium whitespace-nowrap text-action ring-1 ring-action/15 backdrop-blur sm:px-3 sm:py-1.5 sm:text-sm">
            <ShieldCheck aria-hidden className="size-3.5 shrink-0 sm:size-4" />
            {badge}
          </span>
          <h1 className="mt-3 max-w-[64%] text-[1.35rem] leading-[1.18] font-bold tracking-[-0.03em] text-ink sm:max-w-[58%] sm:text-[2.6rem] lg:mt-5 lg:max-w-none lg:text-[3.1rem] xl:text-[3.6rem]">
            {h.heroLine1}
            <br />
            <span className="bg-gradient-to-r from-[#1f5ff2] via-[#7b3ff2] to-[#ff8a00] bg-clip-text pr-1 text-transparent">{h.heroLine2}</span>
          </h1>
          <p className="mt-2.5 max-w-[60%] text-[12.5px] leading-relaxed text-ink sm:max-w-[55%] sm:text-base lg:mt-4 lg:max-w-md lg:text-lg lg:text-ink-muted">{h.heroSubtitleLong}</p>

          <form action="/ask" method="get" role="search" className="-mx-2 mt-5 flex items-stretch gap-3 sm:mx-0 lg:mt-7 lg:max-w-[42rem]">
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-surface p-1.5 pl-3.5 shadow-lift ring-1 ring-line/50 sm:p-2 sm:pl-5 lg:rounded-2xl lg:py-2.5">
              <Search aria-hidden className="size-5 shrink-0 text-ink-subtle" />
              <HeroSearchInput placeholder={h.searchPlaceholder} shortPlaceholder={h.searchPlaceholderShort} />
              <label className="relative flex shrink-0 items-center gap-0.5 border-l border-line pl-1.5 text-ink sm:gap-1.5 sm:pl-3">
                <MapPin aria-hidden className="size-3.5 shrink-0 text-action sm:size-4" />
                <span className="sr-only">{h.areaLabel}</span>
                <select name="area" defaultValue={area ?? ""} className="w-[6rem] appearance-none truncate bg-transparent pr-4 text-[10.5px] font-medium focus:outline-none sm:w-auto sm:max-w-40 sm:text-sm">
                  <option value="">Dar es Salaam</option>
                  {districts.map((d) => (
                    <optgroup key={d.slug} label={d.name}>
                      {d.children.map((a) => (
                        <option key={a.slug} value={a.slug}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown aria-hidden className="pointer-events-none absolute right-0 size-4 text-ink-subtle" />
              </label>
              {/* Phones and tablets: the round button inside the bar. */}
              <button type="submit" aria-label={t.ai.ask} className="grid size-11 shrink-0 place-items-center rounded-full bg-action text-white shadow-soft transition hover:bg-action-hover active:scale-95 lg:hidden">
                <Search aria-hidden className="size-5" />
              </button>
            </div>
            {/* Large screens: the button as its own square, beside the bar. */}
            <button type="submit" aria-label={t.ai.ask} className="hidden w-[4.5rem] shrink-0 place-items-center rounded-2xl bg-action text-white shadow-lift transition hover:bg-action-hover active:scale-95 lg:grid">
              <Search aria-hidden className="size-6" />
            </button>
          </form>

          {/* Large screens: filters and trust row inside the hero, on the light side. */}
          <div className="hidden lg:block">
            <QuickFilters quick={quick} />
            <TrustRow t={t} />
          </div>
        </div>

        {stat && (
          <div className="absolute right-7 bottom-7 hidden items-center gap-3 rounded-2xl bg-surface/95 px-4 py-3 shadow-lift backdrop-blur lg:flex">
            <span className="grid size-10 place-items-center rounded-full bg-action text-white">
              <stat.Icon aria-hidden className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{stat.title}</span>
              <span className="block text-xs text-ink-muted">{stat.sub}</span>
            </span>
          </div>
        )}
      </div>

      {/* Phones and tablets: filters and trust row under the hero, like the mockup. */}
      <div className="lg:hidden">
        <QuickFilters quick={quick} />
        <TrustRow t={t} />
      </div>
    </section>
  );
}

function QuickFilters({ quick }: { quick: Quick[] }) {
  const QUICK_ICON = { near: Navigation, now: Zap, verified: ShieldCheck, top: Star };
  return (
    <ul className="-mx-2 mt-4 flex gap-1 overflow-x-auto px-0.5 no-scrollbar sm:mx-0 sm:gap-2 sm:px-0 lg:mt-5">
      {quick.map(({ href, label, icon }) => {
        const Icon = QUICK_ICON[icon];
        return (
          <li key={label} className="shrink-0">
            <Link href={href} className="flex min-h-9 items-center gap-1 rounded-full bg-surface px-2 text-[10px] font-medium whitespace-nowrap text-ink shadow-soft ring-1 ring-line/60 transition hover:shadow-lift active:scale-[0.97] sm:min-h-10 sm:gap-2 sm:px-4 sm:text-sm">
              <Icon aria-hidden className="size-3 text-action sm:size-4" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TrustRow({ t }: { t: Dictionary }) {
  const h = t.ui.home;
  const trust = [
    { Icon: ShieldCheck, title: h.trustSafe, sub: h.trustSafeSub },
    { Icon: Clock, title: h.trustFast, sub: h.trustFastSub },
    { Icon: Bot, title: t.ai.title, sub: h.trustAiSub },
  ];
  return (
    <ul className="mt-5 grid grid-cols-3 lg:mt-6 lg:flex lg:flex-nowrap">
      {trust.map(({ Icon, title, sub }, i) => (
        <li key={title} className={`flex min-w-0 items-center gap-1.5 sm:gap-3 lg:shrink-0 lg:whitespace-nowrap ${i ? "border-l border-line pl-2 sm:pl-4 xl:pl-6" : ""} ${i < 2 ? "pr-2 sm:pr-4 xl:pr-6" : ""}`}>
          <Icon aria-hidden className="size-6 shrink-0 text-action sm:size-8" strokeWidth={1.6} />
          <span className="min-w-0">
            <span className="block text-[10px] leading-tight font-semibold sm:text-sm">{title}</span>
            <span className="block text-[9.5px] leading-tight text-ink-muted sm:text-xs">{sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
