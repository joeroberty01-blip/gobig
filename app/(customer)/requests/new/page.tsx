import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { getAreaOptions, getServiceOptions } from "@/lib/data/provider";
import { getSavedArea } from "@/lib/discovery/area";
import { darToday } from "@/lib/validators/requests";
import { RequestForm } from "@/components/requests/RequestForm";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.requests.new.title };
}

const SLUG = /^[a-z0-9-]{1,80}$/;
const one = (v: string | string[] | undefined) => (typeof v === "string" && SLUG.test(v) ? v : null);

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const providerSlug = one(sp.provider);
  const serviceSlug = one(sp.service);
  const categorySlug = one(sp.category);
  // From AI search (Phase 9): the area the customer named; otherwise their saved area.
  const areaSlug = one(sp.area);
  await requirePageAccess("requests:create", `/requests/new${providerSlug ? `?provider=${providerSlug}` : ""}`);
  const { t } = await getServerDictionary();

  const [categories, districts, savedArea, service, category, target] = await Promise.all([
    getServiceOptions(),
    getAreaOptions(),
    getSavedArea(),
    serviceSlug ? prisma.service.findFirst({ where: { slug: serviceSlug, isActive: true }, select: { id: true, categoryId: true } }) : null,
    categorySlug ? prisma.category.findFirst({ where: { slug: categorySlug, isActive: true }, select: { id: true } }) : null,
    providerSlug
      ? prisma.provider.findFirst({
          where: { slug: providerSlug, status: "ACTIVE", deletedAt: null, profile: { isNot: null } },
          select: {
            slug: true,
            profile: { select: { displayName: true, primaryCategoryId: true } },
            services: { select: { service: { select: { id: true, nameEn: true, nameSw: true, categoryId: true, isActive: true } } } },
          },
        })
      : null,
  ]);
  if (providerSlug && !target) notFound();
  const areaChoice = areaSlug ?? savedArea;
  const area = areaChoice ? await prisma.location.findFirst({ where: { slug: areaChoice, isActive: true }, select: { id: true } }) : null;

  const title = target ? fill(t.requests.new.directTitle, { name: target.profile!.displayName }) : t.requests.new.title;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={title}
        subtitle={target ? fill(t.requests.new.directIntro, { name: target.profile!.displayName }) : t.requests.new.intro}
      />
      <Card>
        <RequestForm
          categories={categories.map((c) => ({ id: c.id, nameEn: c.nameEn, nameSw: c.nameSw, services: c.services }))}
          districts={districts.map((d) => ({ id: d.id, name: d.name, children: d.children.map((a) => ({ id: a.id, name: a.name })) }))}
          initial={{
            categoryId: service?.categoryId ?? category?.id ?? "",
            serviceId: service && (!target || target.services.some((s) => s.service.id === service.id)) ? service.id : "",
            locationId: area?.id ?? "",
          }}
          today={darToday().toISOString().slice(0, 10)}
          target={
            target
              ? {
                  slug: target.slug,
                  name: target.profile!.displayName,
                  categoryId: target.profile!.primaryCategoryId,
                  services: target.services.filter((s) => s.service.isActive).map(({ service: s }) => ({ id: s.id, nameEn: s.nameEn, nameSw: s.nameSw, categoryId: s.categoryId })),
                }
              : null
          }
        />
      </Card>
    </div>
  );
}
