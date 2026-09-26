import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { providerNav } from "@/components/layout/navItems";

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const [{ t }, user] = await Promise.all([getServerDictionary(), requirePageAccess("provider-area:access", "/provider")]);
  return (
    <AppShell user={user} nav={providerNav(t)} homeHref="/provider" areaLabel={t.roles.PROVIDER}>
      {children}
    </AppShell>
  );
}
