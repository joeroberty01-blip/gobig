import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { AccountPanel } from "@/components/account/AccountPanel";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.account.title };
}

export default async function AdminAccountPage() {
  const user = await requirePageAccess("security:manage-own", "/admin/account");
  return <AccountPanel user={user} />;
}
