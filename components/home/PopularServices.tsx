import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { CategoryCard, photoFor } from "./CategoryCard";

type Category = { slug: string; nameEn: string; nameSw: string; icon: string | null; services: { nameEn: string; nameSw: string }[]; children?: { nameEn: string; nameSw: string }[] };

/** "Popular Services" — owner's reference design: photo cards with a coloured round icon and an arrow. */
export function PopularServices({ t, locale, categories, max = 8 }: { t: Dictionary; locale: Locale; categories: Category[]; max?: number }) {
  const h = t.ui.home;
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  return (
    <section className="mt-8 sm:mt-12">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{h.popularTitle}</h2>
          <p className="mt-1 text-xs text-ink-muted sm:text-base">{h.popularSubtitle}</p>
        </div>
        <Link href="/categories" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-action sm:text-sm">
          {h.viewAllServices}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-4 lg:grid-cols-6">
        {categories.slice(0, max).map((c, i) => (
          <li key={c.slug} className="w-[10.5rem] shrink-0 sm:w-auto">
            <CategoryCard href={`/c/${c.slug}`} name={name(c)} icon={c.icon} subtitle={(() => {
                const items = c.services.length ? c.services : (c.children ?? []);
                return items.length ? `${items.map(name).join(", ")}…` : "";
              })()} index={i} photo={photoFor(c.slug)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
