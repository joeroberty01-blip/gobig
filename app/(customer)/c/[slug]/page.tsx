import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { searchHref } from "@/lib/discovery/query";
import { getAreaPickerOptions, resolveSearchParams } from "@/lib/data/discovery";
import { providerCardsByIds, searchProviders } from "@/lib/services/discovery";
import { AreaPicker } from "@/components/discovery/AreaPicker";
import { CategoryIcon } from "@/components/discovery/CategoryIcon";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { CardGrid, Section } from "@/components/discovery/Section";
import { Card } from "@/components/ui";
import { trackAppearances } from "@/lib/analytics";
import { sponsoredFor } from "@/lib/services/billing";
import { SponsoredResults } from "@/components/monetization/Sponsored";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function loadCategory(slug: string) {
  return prisma.category.findFirst({
    where: { slug, isActive: true },
    select: {
      slug: true,
      nameEn: true,
      nameSw: true,
      icon: true,
      parent: { select: { slug: true, nameEn: true, nameSw: true } },
      children: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, nameEn: true, nameSw: true } },
      services: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, nameEn: true, nameSw: true } },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, { locale }] = await Promise.all([params, getServerDictionary()]);
  const c = await loadCategory(slug);
  return c ? { title: locale === "sw" ? c.nameSw : c.nameEn } : {};
}

/** Category and subcategory browsing: subcategories, services, then providers in this category. */
export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await loadCategory(slug);
  if (!category) notFound();
  const { effective, point } = await resolveSearchParams(await searchParams);
  const query = { ...effective, q: "", category: slug, service: null };
  const [{ t, locale }, districts, result] = await Promise.all([getServerDictionary(), getAreaPickerOptions(), searchProviders(query, undefined, point)]);
  const sponsored = await providerCardsByIds(
    await sponsoredFor({ kind: "SPONSORED_CATEGORY", candidateIds: result.rankedIds, serviceId: null, categoryIds: result.categoryIds, locationIds: result.areaIds }),
  );
  await trackAppearances([...sponsored, ...result.results].map((r) => r.id), "CATEGORY", result.filterIds);
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={category.parent ? `/c/${category.parent.slug}` : "/categories"} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-ink-muted">
        <ChevronLeft aria-hidden className="size-4" />
        {category.parent ? name(category.parent) : t.discovery.allCategories}
      </Link>
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <CategoryIcon name={category.icon} className="size-6" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{name(category)}</h1>
      </div>

      {category.children.length > 0 && (
        <Section title={t.discovery.subcategories}>
          <ul className="flex flex-wrap gap-2">
            {category.children.map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className="flex min-h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-brand-500">
                  {name(c)}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {category.services.length > 0 && (
        <Section title={t.discovery.servicesInCategory}>
          <ul className="flex flex-wrap gap-2">
            {category.services.map((s) => (
              <li key={s.slug}>
                <Link href={searchHref({ area: effective.area }, { service: s.slug })} className="flex min-h-10 items-center rounded-full bg-brand-50 px-4 text-sm font-medium text-brand-900 hover:bg-brand-100">
                  {name(s)}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t.discovery.providersInCategory} href={searchHref(query)} linkLabel={result.total > 0 ? t.discovery.seeAll : undefined}>
        <div className="mb-3">
          <AreaPicker districts={districts} value={result.areaFromPosition ? null : (result.area?.slug ?? null)} compact />
        </div>
        <SponsoredResults cards={sponsored} t={t} locale={locale} />
        {result.total === 0 ? (
          <Card className="text-center text-sm text-ink-muted">{t.discovery.noResultsTitle}</Card>
        ) : (
          <CardGrid>
            {result.results.map((p) => (
              <ProviderCard key={p.id} p={p} t={t} locale={locale} originArea={result.origin?.kind === "area" ? (result.area?.name ?? null) : null} />
            ))}
          </CardGrid>
        )}
      </Section>
    </div>
  );
}
