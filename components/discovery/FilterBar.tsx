"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { searchHref, type SearchParams } from "@/lib/discovery/query";
import { AreaPicker, type AreaOption } from "./AreaPicker";

type Category = { slug: string; nameEn: string; nameSw: string };

/** Search filters as a horizontally scrollable chip row — thumb-friendly on phones. */
export function FilterBar({
  params,
  areaSlug,
  districts,
  categories,
}: {
  params: SearchParams;
  areaSlug: string | null;
  districts: AreaOption[];
  categories: Category[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const base = { ...params, area: params.area ?? areaSlug };
  const chip = (on: boolean) =>
    `flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap ${
      on ? "border-brand-500 bg-brand-50 text-brand-900" : "border-line bg-surface text-ink"
    }`;
  const hasFilters = !!(params.category || params.service || params.openNow || params.priced);

  return (
    <div className="flex flex-col gap-3">
      <AreaPicker districts={districts} value={areaSlug} search={params} compact />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Link href={searchHref(base, { openNow: !params.openNow, page: 1 })} className={chip(params.openNow)} aria-pressed={params.openNow}>
          {params.openNow && <Check aria-hidden className="size-4" />}
          {t.discovery.openNow}
        </Link>
        <Link href={searchHref(base, { priced: !params.priced, page: 1 })} className={chip(params.priced)} aria-pressed={params.priced}>
          {params.priced && <Check aria-hidden className="size-4" />}
          {t.discovery.showsPrices}
        </Link>
        <label className={chip(!!params.category)}>
          <span className="sr-only">{t.discovery.filterCategory}</span>
          <select
            value={params.category ?? ""}
            onChange={(e) => router.push(searchHref(base, { category: e.target.value || null, service: null, page: 1 }))}
            className="max-w-44 bg-transparent focus:outline-none"
          >
            <option value="">{t.discovery.anyCategory}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {locale === "sw" ? c.nameSw : c.nameEn}
              </option>
            ))}
          </select>
        </label>
        {hasFilters && (
          <Link href={searchHref({ q: params.q, area: base.area })} className={chip(false)}>
            <X aria-hidden className="size-4" />
            {t.discovery.clearFilters}
          </Link>
        )}
      </div>
    </div>
  );
}
