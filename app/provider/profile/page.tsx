import type { Metadata } from "next";
import { Eye, Store } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { getEditorData } from "@/lib/data/provider";
import { CompletionBar, CompletionChecklist } from "@/components/provider/Completion";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.ui.nav.profile };
}

/** Phase 14 "Profile" tab: every part of the listing in one place, each linking to its editor. */
export default async function ProviderProfilePage() {
  const user = await requirePageAccess("provider-area:access", "/provider/profile");
  const { t } = await getServerDictionary();
  const providerId = await getOwnedProviderId(user.id);
  if (!providerId) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={t.ui.nav.profile} />
        <EmptyState
          icon={<Store aria-hidden />}
          title={t.profile.dashboard.startTitle}
          body={t.profile.dashboard.startBody}
          action={<ButtonLink href="/provider/setup/name">{t.profile.dashboard.start}</ButtonLink>}
        />
      </div>
    );
  }
  const data = await getEditorData(providerId);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={data.profile?.displayName ?? t.ui.nav.profile}
        subtitle={t.profile.dashboard[`status${data.status}`]}
        action={
          <ButtonLink href={`/p/${data.slug}`} variant="secondary" className="min-h-10">
            <Eye aria-hidden className="size-4" />
            {data.status === "ACTIVE" ? t.profile.dashboard.viewProfile : t.profile.dashboard.previewProfile}
          </ButtonLink>
        }
      />
      <Card className="mb-6">
        <CompletionBar percent={data.completion.percent} t={t} />
      </Card>
      <CompletionChecklist completion={data.completion} t={t} />
    </div>
  );
}
