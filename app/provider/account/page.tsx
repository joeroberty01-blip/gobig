import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { AccountPanel } from "@/components/account/AccountPanel";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.settings.title };
}

export default async function ProviderAccountPage() {
  const user = await requirePageAccess("provider-area:access", "/provider/account");
  return <AccountPanel user={user} />;
}
