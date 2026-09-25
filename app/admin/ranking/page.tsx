import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { getWeightsInfo } from "@/lib/services/ranking";
import { getAreaPickerOptions } from "@/lib/data/discovery";
import { RankingForm } from "@/components/admin/RankingForm";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.ranking.title };
}

export default async function AdminRankingPage() {
  await requirePageAccess("ranking:configure", "/admin/ranking");
  const { t, locale } = await getServerDictionary();
  const [info, services, areas] = await Promise.all([
    getWeightsInfo(),
    prisma.service.findMany({ where: { isActive: true }, orderBy: { nameEn: "asc" }, select: { slug: true, nameEn: true, nameSw: true } }),
    getAreaPickerOptions(),
  ]);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t.ranking.title} subtitle={t.ranking.intro} />
      <p className="-mt-3 mb-4 text-xs text-ink-subtle">
        {info.updatedAt ? fill(t.ranking.lastChange, { date: date.format(info.updatedAt), name: info.updatedBy ?? "—" }) : t.ranking.neverChanged}
      </p>
      <RankingForm saved={info.weights} services={services} areas={areas} />
    </div>
  );
}
