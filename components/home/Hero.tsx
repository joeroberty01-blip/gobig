import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, ChevronDown, Clock, MapPin, Search, ShieldCheck, Sparkles, Star, Zap } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type District = { slug: string; name: string; children: { slug: string; name: string }[] };

/**
 * Home hero — owner's reference design (2026-10-01): badge, two-line question with the last word in
 * the brand gradient, one search bar with the area inside it, quick chips, a trust row, and the Dar
 * es Salaam waterfront on the right behind a curved edge. Plain GET form: works before JS loads.
 */
export function Hero({ t, districts, area, quick }: { t: Dictionary; districts: District[]; area: string | null; quick: { href: string; label: string; icon: "near" | "now" | "verified" | "top" }[] }) {
  const h = t.ui.home;
  const QUICK_ICON = { near: MapPin, now: Zap, verified: ShieldCheck, top: Star };
  const trust = [
    { Icon: ShieldCheck, title: h.trustSafe, sub: h.trustSafeSub },
    { Icon: Clock, title: h.trustFast, sub: h.trustFastSub },
    { Icon: Bot, title: t.ai.title, sub: h.trustAiSub },
  ];
  return (
    <section className="relative -mx-4 -mt-6 overflow-hidden bg-gradient-to-b from-[#eef4ff] to-canvas px-4 pt-5 pb-6 sm:mx-0 sm:mt-0 sm:rounded-[2rem] sm:px-10 sm:pt-12 sm:pb-10 lg:min-h-[30rem]">
      {/* Large screens: the waterfront fills the right half behind a curved edge. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] lg:block">
        <Image src="/hero-dar.webp" alt="" fill priority sizes="55vw" className="object-cover object-right [clip-path:ellipse(92%_120%_at_100%_50%)]" />
      </div>
      {/* The blue/orange swoosh on the left edge. */}
      <svg aria-hidden viewBox="0 0 120 400" className="pointer-events-none absolute -left-10 bottom-0 hidden h-[85%] w-28 lg:block" preserveAspectRatio="none">
        <path d="M0 0 C 90 120, 95 280, 0 400 Z" fill="#1f5ff2" opacity="0.9" />
        <path d="M0 140 C 70 210, 70 320, 0 400 Z" fill="#ff9500" opacity="0.95" />
      </svg>

      <div className="relative max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-action/10 px-3 py-1.5 text-xs font-semibold text-action sm:text-sm">
          <Sparkles aria-hidden className="size-4" />
          {h.badge}
        </span>
        <h1 className="mt-3 text-[2.1rem] leading-[1.02] font-black tracking-tight text-ink sm:text-6xl lg:text-7xl">
          {h.heroLine1}
          <br />
          <span className="bg-gradient-to-r from-[#1f5ff2] via-[#7b3ff2] to-[#ff9500] bg-clip-text pr-1 text-transparent">{h.heroLine2}</span>
        </h1>
        <p className="mt-3 text-sm text-ink-muted sm:text-lg">{h.heroSubtitleLong}</p>

        <form action="/ask" method="get" role="search" className="mt-5 flex items-center gap-1 rounded-full bg-surface p-1.5 pl-4 shadow-lift sm:mt-7 sm:p-2 sm:pl-5">
          <Search aria-hidden className="size-5 shrink-0 text-ink-subtle" />
          <input
            type="search"
            name="q"
            required
            maxLength={300}
            placeholder={h.searchPlaceholder}
            aria-label={h.searchPlaceholder}
            enterKeyHint="search"
            className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none sm:text-base"
          />
          <label className="relative hidden shrink-0 items-center gap-1.5 border-l border-line pl-3 text-sm font-medium text-ink md:flex">
            <MapPin aria-hidden className="size-4 text-action" />
            <span className="sr-only">{h.areaLabel}</span>
            <select name="area" defaultValue={area ?? ""} className="max-w-40 appearance-none bg-transparent pr-6 text-sm font-medium focus:outline-none">
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
          <button type="submit" aria-label={t.ai.ask} className="grid size-11 shrink-0 place-items-center rounded-full bg-action text-white shadow-soft transition hover:bg-action-hover active:scale-95 sm:size-12">
            <ArrowRight aria-hidden className="size-5" />
          </button>
        </form>

        <ul className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
          {quick.map(({ href, label, icon }) => {
            const Icon = QUICK_ICON[icon];
            return (
              <li key={label} className="shrink-0">
                <Link href={href} className="flex min-h-10 items-center gap-2 rounded-full bg-surface px-4 text-[13px] font-medium text-ink shadow-soft transition hover:shadow-lift active:scale-[0.97] sm:text-sm">
                  <Icon aria-hidden className="size-4 text-action" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Phones and tablets (owner, 2026-10-01): the words first, then the photo below them, in full. */}
        <div aria-hidden className="relative mt-5 h-44 overflow-hidden rounded-3xl shadow-soft sm:h-64 lg:hidden">
          <Image src="/hero-dar.webp" alt="" fill priority sizes="100vw" className="object-cover object-right" />
        </div>

        <ul className="mt-6 hidden flex-wrap gap-x-6 gap-y-3 sm:flex">
          {trust.map(({ Icon, title, sub }, i) => (
            <li key={title} className={`flex items-center gap-3 ${i ? "sm:border-l sm:border-line sm:pl-6" : ""}`}>
              <Icon aria-hidden className="size-8 text-action" strokeWidth={1.75} />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-ink-muted">{sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
