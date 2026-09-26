import { getServerDictionary } from "@/lib/i18n/server";
import { getSavedArea, getSavedPoint } from "@/lib/discovery/area";
import { getAreaPickerOptions } from "@/lib/data/discovery";
import { AreaPicker } from "@/components/discovery/AreaPicker";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { customerNav } from "@/components/layout/navItems";
import { CompareBar } from "@/components/discovery/Compare";

/** Public pages and the customer's own pages share one shell; guests see login/sign-up. */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [{ t }, user, districts, area, point] = await Promise.all([getServerDictionary(), getCurrentUser(), getAreaPickerOptions(), getSavedArea(), getSavedPoint()]);
  return (
    <AppShell user={user} nav={customerNav(t)} homeHref="/" location={<AreaPicker districts={districts} value={point ? null : area} pill />}>
      {children}
      <CompareBar />
    </AppShell>
  );
}
