import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { CategoryCard, photoFor } from "./CategoryCard";

type Category = { slug: string; nameEn: string; nameSw: string; icon: string | null; services: { nameEn: string; nameSw: string }[] };

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
        {categories.slice(0, max).map((c, i) => (
          <li key={c.slug} className="w-40 shrink-0 sm:w-auto">
            <CategoryCard href={`/c/${c.slug}`} name={name(c)} icon={c.icon} subtitle={c.services.length ? `${c.services.map(name).join(", ")}…` : ""} index={i} photo={photoFor(c.slug)} />
          </li>
        ))}
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
