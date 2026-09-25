import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { locationsForAdmin } from "@/lib/services/admin/catalog";
import { LocationForm } from "@/components/admin/platform/Controls";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.locations.title };
}

export default async function AdminLocationsPage() {
  await requirePageAccess("catalog:manage", "/admin/locations");
  const { t } = await getServerDictionary();
  const l = t.adminPlatform.locations;
  const districts = await locationsForAdmin();
  const districtOptions = districts.map((d) => ({ id: d.id, name: d.name }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title={l.title} subtitle={l.intro} />
      {districts.map((d) => (
        <Card key={d.id}>
          <h2 className="mb-2 font-semibold">{d.name}</h2>
          <ul className="flex flex-col gap-1">
            {d.children.map((a) => (
              <li key={a.id}>
                <details className={`rounded-xl border border-line px-3 py-2 ${a.isActive ? "" : "opacity-60"}`}>
                  <summary className="cursor-pointer text-sm">
                    {a.name}{" "}
                    <span className="text-xs text-ink-subtle">
                      · {fill(l.providers, { count: a._count.providers })}
                      {a.latitude == null ? " · ⌖ —" : ""}
                      {a.isActive ? "" : ` · ${t.adminPlatform.common.inactive}`}
                    </span>
                  </summary>
                  <div className="mt-3">
                    <LocationForm initial={{ id: a.id, parentId: d.id, name: a.name, latitude: a.latitude, longitude: a.longitude, isActive: a.isActive }} districts={districtOptions} />
                  </div>
                </details>
              </li>
            ))}
            <li>
              <details className="rounded-xl border border-dashed border-line px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">+ {l.newArea}</summary>
                <div className="mt-3">
                  <LocationForm initial={{ id: null, parentId: d.id, name: "", latitude: null, longitude: null, isActive: true }} districts={districtOptions} />
                </div>
              </details>
            </li>
          </ul>
        </Card>
      ))}
    </div>
  );
}
