import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { NotificationList } from "@/components/requests/NotificationList";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.requests.notifications.title };
}

export default async function CustomerNotificationsPage() {
  const user = await requirePageAccess("notifications:view", "/notifications");
  // Providers read theirs inside the provider area; admins have none yet.
  if (user.role === "PROVIDER") redirect("/provider/notifications");
  if (user.role !== "CUSTOMER") redirect("/admin");
  const { t, locale } = await getServerDictionary();
  return <NotificationList userId={user.id} basePath="/requests" t={t} locale={locale} />;
}
