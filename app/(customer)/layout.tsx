import { getServerDictionary } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { customerNav } from "@/components/layout/navItems";
import { CompareBar } from "@/components/discovery/Compare";

/** Public pages and the customer's own pages share one shell; guests see login/sign-up. */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [{ t }, user] = await Promise.all([getServerDictionary(), getCurrentUser()]);
  return (
    <AppShell user={user} nav={customerNav(t)} homeHref="/">
      {children}
      <CompareBar />
    </AppShell>
  );
}
