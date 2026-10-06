import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { CategoryCard, photoFor } from "@/components/home/CategoryCard";
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
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t.discovery.allCategories} />
      {/* Same cards as "Popular Services" on the home page (owner's redesign, 2026-10-06). */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((c, i) => (
          <li key={c.slug}>
            <CategoryCard
              href={`/c/${c.slug}`}
              name={name(c)}
              icon={c.icon}
              subtitle={(c.children.length ? c.children : c.services).map(name).join(" · ")}
              index={i}
              photo={photoFor(c.slug)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
