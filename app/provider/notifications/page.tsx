import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { NotificationList } from "@/components/requests/NotificationList";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.requests.notifications.title };
}

export default async function ProviderNotificationsPage() {
  const user = await requirePageAccess("requests:respond", "/provider/notifications");
  const { t, locale } = await getServerDictionary();
  return <NotificationList userId={user.id} basePath="/provider/requests" t={t} locale={locale} />;
}
