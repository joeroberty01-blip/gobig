import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getPreferences } from "@/lib/notifications/preferences";
import { vapidPublicKey } from "@/lib/notifications/push";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.notify.title };
}

/** Automation Engine, Phase C: the person's own notification settings. */
export default async function NotificationSettingsPage() {
  const user = await requirePageAccess("notifications:view", "/account/notifications");
  const { t } = await getServerDictionary();
  const [prefs, account] = await Promise.all([getPreferences(user.id), prisma.user.findUnique({ where: { id: user.id }, select: { email: true, phone: true } })]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.notify.title} subtitle={t.notify.intro} />
      <NotificationSettings initial={prefs} vapidKey={vapidPublicKey()} hasEmail={!!account?.email} hasPhone={!!account?.phone} />
    </div>
  );
}
