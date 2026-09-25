import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { LevelForm } from "@/components/trust/AdminTrustForms";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trust.admin.levelsTitle };
}

/** Super admins only: the verification tiers are platform policy. */
export default async function VerificationLevelsPage() {
  await requirePageAccess("verification:configure", "/admin/verification/levels");
  const { t } = await getServerDictionary();
  const levels = await prisma.verificationLevel.findMany({ orderBy: { rank: "asc" } });

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/verification" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-ink-muted">
        <ArrowLeft aria-hidden className="size-4" />
        {t.trust.admin.verificationTitle}
      </Link>
      <PageHeader title={t.trust.admin.levelsTitle} subtitle={t.trust.admin.levelsIntro} />
      <div className="flex flex-col gap-4">
        {levels.map((l) => (
          <Card key={l.id}>
            <LevelForm
              level={{
                id: l.id,
                slug: l.slug,
                nameEn: l.nameEn,
                nameSw: l.nameSw,
                descriptionEn: l.descriptionEn,
                descriptionSw: l.descriptionSw,
                rank: l.rank,
                requiredDocuments: l.requiredDocuments,
                isActive: l.isActive,
              }}
            />
          </Card>
        ))}
        <Card>
          <h2 className="mb-3 font-semibold">{t.trust.admin.newLevel}</h2>
          <LevelForm />
        </Card>
      </div>
    </div>
  );
}
