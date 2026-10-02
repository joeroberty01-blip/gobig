import Image from "next/image";
import Link from "next/link";
import { existsSync } from "node:fs";
import path from "node:path";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { CategoryIcon } from "@/components/discovery/CategoryIcon";

type Category = { slug: string; nameEn: string; nameSw: string; icon: string | null; services: { nameEn: string; nameSw: string }[] };

// One accent per card for the round icon (reference design), cycling in order.
const ACCENTS = ["#1f5ff2", "#ef4444", "#7c3aed", "#16a34a", "#ec4899", "#4338ca", "#f97316", "#0d9488"];

/** A photo for the category if we have one (public/categories/<slug>.webp), else an illustrated tile. */
function photoFor(slug: string): string | null {
  return existsSync(path.join(process.cwd(), "public", "categories", `${slug}.webp`)) ? `/categories/${slug}.webp` : null;
}

/** "Popular Services" — owner's reference design: photo cards with a coloured round icon and an arrow. */
export function PopularServices({ t, locale, categories, max = 8 }: { t: Dictionary; locale: Locale; categories: Category[]; max?: number }) {
  const h = t.ui.home;
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  return (
    <section className="mt-10 sm:mt-14">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight sm:text-3xl">{h.popularTitle}</h2>
          <p className="mt-1 text-xs text-ink-muted sm:text-base">{h.popularSubtitle}</p>
        </div>
        <Link href="/categories" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-action sm:text-sm">
          {h.viewAllServices}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-5 xl:grid-cols-9">
        {categories.slice(0, max).map((c, i) => {
          const photo = photoFor(c.slug);
          const accent = ACCENTS[i % ACCENTS.length]!;
          return (
            <li key={c.slug} className="w-40 shrink-0 sm:w-auto">
              <Link href={`/c/${c.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-line/60 transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="relative block aspect-[4/3] overflow-hidden">
                  {photo ? (
                    <Image src={photo} alt="" fill sizes="(max-width: 640px) 160px, 220px" className="object-cover object-top transition duration-500 group-hover:scale-105" />
                  ) : (
                    <span className="grid size-full place-items-center" style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}55)` }}>
                      <CategoryIcon name={c.icon} className="size-14 opacity-60" />
                    </span>
                  )}
                </span>
                <span className="relative flex flex-1 flex-col px-3 pt-8 pb-3">
                  <span className="absolute -top-6 left-3 grid size-12 place-items-center rounded-full text-white shadow-lift ring-4 ring-surface" style={{ background: accent }}>
                    <CategoryIcon name={c.icon} className="size-5" />
                  </span>
                  <span className="absolute top-2 right-2.5 grid size-6 place-items-center rounded-full bg-action/10 text-action transition group-hover:bg-action group-hover:text-white">
                    <ArrowRight aria-hidden className="size-3.5" />
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-tight font-bold">{name(c)}</span>
                  {c.services.length > 0 && <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-muted">{c.services.map(name).join(", ")}…</span>}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="w-40 shrink-0 sm:w-auto">
          <Link href="/categories" className="group flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-line/60 transition hover:-translate-y-0.5 hover:shadow-lift">
            <span className="relative block aspect-[4/3] overflow-hidden">
              <Image src="/hero-dar.webp" alt="" fill sizes="220px" className="object-cover" />
            </span>
            <span className="relative flex flex-1 flex-col px-3 pt-8 pb-3">
              <span className="absolute -top-6 left-3 grid size-12 place-items-center rounded-full bg-[#6366f1] text-white shadow-lift ring-4 ring-surface">
                <MoreHorizontal aria-hidden className="size-5" />
              </span>
              <span className="absolute top-2 right-2.5 grid size-6 place-items-center rounded-full bg-action/10 text-action transition group-hover:bg-action group-hover:text-white">
                <ArrowRight aria-hidden className="size-3.5" />
              </span>
              <span className="text-[13px] font-bold">{h.moreServices}</span>
              <span className="mt-1 text-[11px] text-ink-muted">{h.moreServicesSub}</span>
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
