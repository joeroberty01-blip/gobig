import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { AccountPanel } from "@/components/account/AccountPanel";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.account.title };
}

export default async function AccountPage() {
  const user = await requirePageAccess("account:view", "/account");
  // Providers and admins keep their own shell and navigation.
  if (user.role === "PROVIDER") redirect("/provider/account");
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") redirect("/admin/account");
  return <AccountPanel user={user} />;
}
