import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { CategoryIcon } from "@/components/discovery/CategoryIcon";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.discovery.allCategories };
}

export default async function CategoriesPage() {
  const { t, locale } = await getServerDictionary();
  const categories = await prisma.category.findMany({
    where: { parentId: null, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      slug: true,
      nameEn: true,
      nameSw: true,
      icon: true,
      children: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, nameEn: true, nameSw: true } },
      services: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 3, select: { nameEn: true, nameSw: true } },
    },
  });
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.discovery.allCategories} />
      <ul className="flex flex-col gap-2">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/c/${c.slug}`} className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-surface p-3 hover:border-brand-500">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <CategoryIcon name={c.icon} className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{name(c)}</span>
                <span className="block truncate text-sm text-ink-muted">{(c.children.length ? c.children : c.services).map(name).join(" · ")}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
