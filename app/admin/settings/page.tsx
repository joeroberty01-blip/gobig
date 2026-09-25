import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { PlatformSettingsForm } from "@/components/admin/platform/Controls";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.settings.title };
}

export default async function AdminSettingsPage() {
  // Admins can see the settings; only a super admin can change them.
  const actor = await requirePageAccess("admin-area:access", "/admin/settings");
  const { t } = await getServerDictionary();
  const settings = await getPlatformSettings({ fresh: true });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.adminPlatform.settings.title} subtitle={t.adminPlatform.settings.intro} />
      <Card>
        <PlatformSettingsForm initial={settings} canEdit={can(actor, "settings:manage")} />
      </Card>
    </div>
  );
}
