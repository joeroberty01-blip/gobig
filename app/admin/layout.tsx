import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { adminNav } from "@/components/layout/navItems";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [{ t }, user] = await Promise.all([getServerDictionary(), requirePageAccess("admin-area:access", "/admin")]);
  return (
    <AppShell user={user} items={adminNav(t)} homeHref="/admin" areaLabel={t.admin.title}>
      {children}
    </AppShell>
  );
}
