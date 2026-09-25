import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { catalogForAdmin } from "@/lib/services/admin/catalog";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/discovery/CategoryIcon";
import { CategoryForm, ServiceForm } from "@/components/admin/platform/Controls";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.catalog.title };
}

const pick = (c: { id: string; nameEn: string; nameSw: string; icon: string | null; sortOrder: number; isActive: boolean }, parentId: string | null) => ({
  id: c.id,
  nameEn: c.nameEn,
  nameSw: c.nameSw,
  icon: c.icon,
  sortOrder: c.sortOrder,
  isActive: c.isActive,
  parentId,
});

type Svc = { id: string; nameEn: string; nameSw: string; keywords: string[]; sortOrder: number; isActive: boolean; categoryId: string; _count: { providers: number } };

export default async function AdminCatalogPage() {
  await requirePageAccess("catalog:manage", "/admin/categories");
  const { t, locale } = await getServerDictionary();
  const c = t.adminPlatform.catalog;
  const tree = await catalogForAdmin();
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const parents = tree.map((p) => ({ id: p.id, nameEn: p.nameEn, nameSw: p.nameSw }));
  const categoryOptions = tree.flatMap((p) => [{ id: p.id, label: name(p) }, ...p.children.map((ch) => ({ id: ch.id, label: `${name(p)} › ${name(ch)}` }))]);
  const off = (active: boolean) => (active ? "" : "opacity-60");

  const services = (list: Svc[], categoryId: string) => (
    <ul className="mt-2 flex flex-col gap-1">
      {list.map((s) => (
        <li key={s.id}>
          <details className={`rounded-xl border border-line px-3 py-2 ${off(s.isActive)}`}>
            <summary className="cursor-pointer text-sm">
              {name(s)} <span className="text-xs text-ink-subtle">· {fill(c.providers, { count: s._count.providers })}{s.isActive ? "" : ` · ${t.adminPlatform.common.inactive}`}</span>
            </summary>
            <div className="mt-3">
              <ServiceForm initial={{ id: s.id, categoryId: s.categoryId, nameEn: s.nameEn, nameSw: s.nameSw, keywords: s.keywords, sortOrder: s.sortOrder, isActive: s.isActive }} categories={categoryOptions} />
            </div>
          </details>
        </li>
      ))}
      <li>
        <details className="rounded-xl border border-dashed border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">+ {c.newService}</summary>
          <div className="mt-3">
            <ServiceForm initial={{ id: null, categoryId, nameEn: "", nameSw: "", keywords: [], sortOrder: list.length, isActive: true }} categories={categoryOptions} />
          </div>
        </details>
      </li>
    </ul>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title={c.title} subtitle={c.intro} />
      <details className="rounded-2xl border border-dashed border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold text-brand-700">+ {c.newCategory}</summary>
        <div className="mt-3">
          <CategoryForm initial={{ id: null, nameEn: "", nameSw: "", icon: null, sortOrder: tree.length, isActive: true, parentId: null }} parents={parents} icons={CATEGORY_ICON_NAMES} />
        </div>
      </details>
      {tree.map((p) => (
        <Card key={p.id} className={off(p.isActive)}>
          <details>
            <summary className="flex cursor-pointer items-center gap-2 font-semibold">
              <CategoryIcon name={p.icon} className="size-5 text-brand-700" />
              {name(p)}
              {!p.isActive && <span className="text-xs font-normal text-ink-subtle">· {t.adminPlatform.common.inactive}</span>}
            </summary>
            <div className="mt-3">
              <CategoryForm initial={pick(p, null)} parents={parents} icons={CATEGORY_ICON_NAMES} />
            </div>
          </details>
          {p.services.length > 0 && services(p.services, p.id)}
          <ul className="mt-3 flex flex-col gap-3 border-l-2 border-line pl-3">
            {p.children.map((ch) => (
              <li key={ch.id} className={off(ch.isActive)}>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">
                    {name(ch)}
                    {!ch.isActive && <span className="text-xs font-normal text-ink-subtle"> · {t.adminPlatform.common.inactive}</span>}
                  </summary>
                  <div className="mt-3">
                    <CategoryForm initial={pick(ch, ch.parentId)} parents={parents} icons={CATEGORY_ICON_NAMES} />
                  </div>
                </details>
                {services(ch.services, ch.id)}
              </li>
            ))}
            <li>
              <details className="rounded-xl border border-dashed border-line px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">+ {c.newSubcategory}</summary>
                <div className="mt-3">
                  <CategoryForm initial={{ id: null, nameEn: "", nameSw: "", icon: null, sortOrder: p.children.length, isActive: true, parentId: p.id }} parents={parents} icons={CATEGORY_ICON_NAMES} />
                </div>
              </details>
            </li>
          </ul>
        </Card>
      ))}
    </div>
  );
}
