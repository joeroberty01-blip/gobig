"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Clock, Sparkles, Star, Tag, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { searchHref, type SearchParams } from "@/lib/discovery/query";
import { AreaPicker, type AreaOption } from "./AreaPicker";

type Category = { slug: string; nameEn: string; nameSw: string };

/**
 * Search filters (Phase 14): ordering first (best match / top rated), then toggles, as one
 * horizontally scrollable chip row — thumb-friendly on phones. Every chip is a plain link, so it
 * works before JavaScript loads and the URL stays shareable.
 */
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
    `flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition active:scale-[0.97] ${
      on ? "border-action bg-action text-white" : "border-line bg-surface text-ink hover:border-ink-subtle/50"
    }`;
  const hasFilters = !!(params.category || params.service || params.openNow || params.priced || params.verified || params.sort === "top");
  const toggle = (on: boolean, next: Partial<SearchParams>, Icon: typeof Clock, label: string) => (
    <Link href={searchHref(base, { ...next, page: 1 })} className={chip(on)} aria-pressed={on}>
      {on ? <Check aria-hidden className="size-4" /> : <Icon aria-hidden className="size-4 text-ink-subtle" />}
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-3">
      <AreaPicker districts={districts} value={areaSlug} search={params} compact />
      <div className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        <Link href={searchHref(base, { sort: "best", page: 1 })} className={chip(params.sort !== "top")} aria-pressed={params.sort !== "top"}>
          <Sparkles aria-hidden className={`size-4 ${params.sort !== "top" ? "" : "text-ink-subtle"}`} />
          {t.ui.search.bestMatch}
        </Link>
        <Link href={searchHref(base, { sort: "top", page: 1 })} className={chip(params.sort === "top")} aria-pressed={params.sort === "top"} title={t.ui.search.topRatedHint}>
          <Star aria-hidden className={`size-4 ${params.sort === "top" ? "fill-accent-400 text-accent-400" : "text-ink-subtle"}`} />
          {t.ui.home.topRated}
        </Link>
        <span aria-hidden className="my-2 w-px shrink-0 bg-line" />
        {toggle(params.openNow, { openNow: !params.openNow }, Clock, t.ui.home.availableNow)}
        {toggle(params.verified, { verified: !params.verified }, BadgeCheck, t.ui.home.verified)}
        {toggle(params.priced, { priced: !params.priced }, Tag, t.discovery.showsPrices)}
        <label className={chip(!!params.category)}>
          <span className="sr-only">{t.discovery.filterCategory}</span>
          <select
            value={params.category ?? ""}
            onChange={(e) => router.push(searchHref(base, { category: e.target.value || null, service: null, page: 1 }))}
            className="max-w-44 bg-transparent focus:outline-none [&>option]:bg-surface [&>option]:text-ink"
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
