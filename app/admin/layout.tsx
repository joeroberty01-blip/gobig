import { getServerDictionary } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { requirePageAccess } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { adminNav } from "@/components/layout/navItems";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [{ t, locale }, user] = await Promise.all([getServerDictionary(), requirePageAccess("security:manage-own", "/admin")]);
  return (
    <AppShell user={user} nav={adminNav(t)} homeHref="/admin" areaLabel={t.admin.title}>
      {/* Full dictionary for admin client components (the root layout sends a trimmed one). */}
      <I18nProvider t={t} locale={locale}>
        {children}
      </I18nProvider>
    </AppShell>
  );
}
