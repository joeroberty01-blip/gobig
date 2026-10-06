import Image from "next/image";
import Link from "next/link";
import { Bot, ChevronDown, Clock, MapPin, Navigation, Search, ShieldCheck, Star, Store, Zap } from "lucide-react";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import type { HomeStats } from "@/lib/services/homeStats";

type District = { slug: string; name: string; children: { slug: string; name: string }[] };

/**
 * Home hero — owner's mockups (2026-10-06): badge, "Find the right help. / Right around you." with
 * the second line in the brand gradient, one search bar with the area inside it, quick filters and a
 * trust row. Phones: a light card with the Dar waterfront in the top-right corner behind a curved
 * edge. Large screens: text on the left, the photo as a rounded card on the right with a stat badge.
 * The mockups' "Trusted by 10,000+" was invented; the badges show only real counts (or nothing).
 * Plain GET form: works before JavaScript loads.
 */
export function Hero({
  t,
  districts,
  area,
  quick,
  stats,
}: {
  t: Dictionary;
  districts: District[];
  area: string | null;
  quick: { href: string; label: string; icon: "near" | "now" | "verified" | "top" }[];
  stats: HomeStats;
}) {
  const h = t.ui.home;
  const QUICK_ICON = { near: Navigation, now: Zap, verified: ShieldCheck, top: Star };
  const trust = [
    { Icon: ShieldCheck, title: h.trustSafe, sub: h.trustSafeSub },
    { Icon: Clock, title: h.trustFast, sub: h.trustFastSub },
    { Icon: Bot, title: t.ai.title, sub: h.trustAiSub },
  ];
  const badge = stats.verified > 0 ? fill(h.verifiedCount, { count: stats.verified }) : h.badge;
  const stat =
    stats.reviews > 0 && stats.avgRating != null
      ? { Icon: Star, title: fill(h.statReviews, { avg: stats.avgRating.toFixed(1) }), sub: fill(h.statReviewsSub, { count: stats.reviews }) }
      : stats.listed > 0
        ? { Icon: Store, title: fill(h.statListed, { count: stats.listed }), sub: h.statListedSub }
        : null;

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#eaf1ff] via-[#f5f8ff] to-surface px-4 pt-4 pb-5 ring-1 ring-line/60 sm:px-8 sm:pt-8 sm:pb-8 lg:grid lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10 lg:overflow-visible lg:rounded-none lg:bg-none lg:p-0 lg:ring-0">
      {/* Phones and tablets: the waterfront in the top-right corner, behind a curved edge. */}
      <div aria-hidden className="pointer-events-none absolute top-0 right-0 h-[58%] w-[47%] sm:w-[45%] lg:hidden">
        <Image src="/hero-dar.webp" alt="" fill priority sizes="50vw" className="object-cover object-[65%_center] [clip-path:ellipse(100%_100%_at_100%_0%)]" />
      </div>
      {/* The blue/orange swoosh on the left edge (phones and tablets). */}
      <svg aria-hidden viewBox="0 0 40 400" preserveAspectRatio="none" className="pointer-events-none absolute top-[22%] -left-1 h-[52%] w-5 lg:hidden">
        <path d="M0 0 C 34 120, 34 280, 0 400 Z" fill="#1f5ff2" />
        <path d="M0 160 C 20 230, 20 330, 0 400 Z" fill="#ff9500" />
      </svg>

      <div className="relative">
        <span className="inline-flex max-w-[56%] items-center gap-1.5 rounded-2xl bg-action/10 px-2.5 py-1 text-[11px] leading-tight font-medium text-action sm:max-w-none sm:rounded-full sm:px-3 sm:py-1.5 sm:text-sm">
          <ShieldCheck aria-hidden className="size-3.5 shrink-0 sm:size-4" />
          <span>{badge}</span>
        </span>
        <h1 className="mt-3 max-w-[60%] text-[1.45rem] leading-[1.15] font-black tracking-tight text-ink sm:max-w-[58%] sm:text-5xl lg:max-w-none lg:text-[2.9rem] xl:text-[3.4rem]">
          {h.heroLine1}
          <br />
          <span className="bg-gradient-to-r from-[#1f5ff2] via-[#7b3ff2] to-[#ff8a00] bg-clip-text pr-1 text-transparent">{h.heroLine2}</span>
        </h1>
        <p className="mt-3 max-w-[56%] text-[13px] leading-relaxed text-ink-muted sm:max-w-[55%] sm:text-lg lg:max-w-md">{h.heroSubtitleLong}</p>

        <form action="/ask" method="get" role="search" className="mt-5 flex items-center gap-1 rounded-full bg-surface p-1.5 pl-3.5 shadow-lift ring-1 ring-line/50 sm:mt-7 sm:p-2 sm:pl-5 lg:max-w-[42rem]">
          <Search aria-hidden className="size-5 shrink-0 text-ink-subtle" />
          <input
            type="search"
            name="q"
            required
            maxLength={300}
            placeholder={h.searchPlaceholder}
            aria-label={h.searchPlaceholder}
            enterKeyHint="search"
            className="min-h-11 min-w-0 flex-1 bg-transparent px-1.5 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none sm:px-2 sm:text-base"
          />
          <label className="relative flex shrink-0 items-center gap-1 border-l border-line pl-2 text-ink sm:gap-1.5 sm:pl-3">
            <MapPin aria-hidden className="size-4 shrink-0 text-action" />
            <span className="sr-only">{h.areaLabel}</span>
            <select name="area" defaultValue={area ?? ""} className="w-[5.6rem] appearance-none truncate bg-transparent pr-5 text-xs font-medium focus:outline-none sm:w-auto sm:max-w-40 sm:text-sm">
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
          <button type="submit" aria-label={t.ai.ask} className="grid size-11 shrink-0 place-items-center rounded-full bg-action text-white shadow-soft transition hover:bg-action-hover active:scale-95 sm:size-12 lg:w-16 lg:rounded-2xl">
            <Search aria-hidden className="size-5" />
          </button>
        </form>

        <ul className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
          {quick.map(({ href, label, icon }) => {
            const Icon = QUICK_ICON[icon];
            return (
              <li key={label} className="shrink-0">
                <Link href={href} className="flex min-h-10 items-center gap-2 rounded-full bg-surface px-3.5 text-[13px] font-medium text-ink shadow-soft ring-1 ring-line/60 transition hover:shadow-lift active:scale-[0.97] sm:px-4 sm:text-sm">
                  <Icon aria-hidden className="size-4 text-action" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        <ul className="mt-5 grid grid-cols-3 gap-2 sm:mt-7 sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-3 xl:gap-x-6">
          {trust.map(({ Icon, title, sub }, i) => (
            <li key={title} className={`flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 ${i ? "border-l border-line pl-2 sm:pl-4 xl:pl-6" : ""}`}>
              <Icon aria-hidden className="size-7 shrink-0 text-action sm:size-8" strokeWidth={1.6} />
              <span className="min-w-0">
                <span className="block text-[11px] leading-tight font-semibold sm:text-sm">{title}</span>
                <span className="block text-[10px] leading-tight text-ink-muted sm:text-xs">{sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Large screens: the photo as a rounded card, with a real-numbers badge. */}
      <div className="relative hidden aspect-[16/10.3] overflow-hidden rounded-[2rem] shadow-lift lg:block">
        <Image src="/hero-dar.webp" alt="" fill priority sizes="50vw" className="object-cover" />
        {stat && (
          <div className="absolute bottom-6 left-6 flex items-center gap-3 rounded-2xl bg-surface/95 px-4 py-3 shadow-lift backdrop-blur">
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
    </section>
  );
}
