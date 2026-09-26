import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import type { CurrentUser } from "@/lib/session";
import { unreadCount } from "@/lib/services/notifications";
import { fill } from "@/lib/i18n/dictionaries";
import { ButtonLink } from "@/components/ui";
import { BottomNav, SideNav, TopNav } from "./NavLinks";
import type { Nav } from "./navItems";
import { LanguageSwitch } from "./LanguageSwitch";
import { Logo } from "./Logo";
import { SignOutLink } from "./SignOutButton";

/**
 * Mobile-first frame (Phase 14). Customers: slim header with inline links on tablet+, bottom tabs
 * on phones. Providers and admins: a dark sidebar with every section on large screens, bottom tabs
 * below that.
 */
export async function AppShell({
  user,
  nav,
  homeHref,
  areaLabel,
  children,
}: {
  user: CurrentUser | null;
  nav: Nav;
  homeHref: string;
  areaLabel?: string;
  children: React.ReactNode;
}) {
  const { t } = await getServerDictionary();
  // Customers and providers get the bell (admins have no notifications yet).
  const bellHref = user?.status === "ACTIVE" ? (user.role === "PROVIDER" ? "/provider/notifications" : user.role === "CUSTOMER" ? "/notifications" : null) : null;
  const unread = bellHref ? await unreadCount(user!.id) : 0;
  const sidebar = !!nav.side;

  const bell = bellHref && (
    <Link
      href={bellHref}
      aria-label={unread ? `${t.requests.notifications.bell} — ${fill(t.requests.notifications.unread, { count: unread })}` : t.requests.notifications.bell}
      className="relative grid size-10 place-items-center rounded-full text-ink-muted transition hover:bg-canvas hover:text-ink"
    >
      <Bell aria-hidden className="size-5" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-bold text-white ring-2 ring-surface">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );

  return (
    <div className={`flex min-h-dvh ${sidebar ? "lg:pl-64" : ""}`}>
      {sidebar && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/5 bg-night-900 px-3 py-5 text-white lg:flex">
          <Link href={homeHref} className="mb-6 flex items-center gap-2.5 px-3">
            <Logo className="size-8" />
            <span className="flex flex-col leading-tight">
              <span className="text-base font-black tracking-tight">{t.app.name}</span>
              {areaLabel && <span className="text-[11px] font-medium text-white/50">{areaLabel}</span>}
            </span>
          </Link>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <SideNav items={nav.side!} />
          </div>
          {user && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="truncate px-3 text-sm font-semibold">{user.name}</p>
              <SignOutLink className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-white/65 hover:bg-white/5 hover:text-white">
                <LogOut aria-hidden className="size-4.5" />
                {t.nav.logout}
              </SignOutLink>
            </div>
          )}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/85 backdrop-blur-xl">
          <div className={`mx-auto flex h-16 items-center gap-3 px-4 ${sidebar ? "max-w-6xl lg:px-8" : "max-w-6xl"}`}>
            <Link href={homeHref} className={`flex items-center gap-2 ${sidebar ? "lg:hidden" : ""}`}>
              <Logo className="size-8" />
              <span className="text-lg font-black tracking-tight text-ink">{t.app.name}</span>
              {areaLabel && <span className="hidden text-xs font-semibold text-ink-subtle uppercase sm:inline">{areaLabel}</span>}
            </Link>
            <div className="ml-6 flex-1">{!sidebar && <TopNav items={nav.tabs} />}</div>
            {bell}
            <LanguageSwitch />
            {!user && (
              <div className="hidden items-center gap-2 sm:flex">
                <ButtonLink href="/login" variant="ghost" className="min-h-9">
                  {t.nav.login}
                </ButtonLink>
                <ButtonLink href="/signup" variant="night" className="min-h-9">
                  {t.nav.signup}
                </ButtonLink>
              </div>
            )}
          </div>
        </header>
        <main className={`pb-bottom-nav mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:pb-12 ${sidebar ? "lg:px-8" : ""}`}>{children}</main>
      </div>
      {/* Phones and tablets: bottom tabs. Desktop: header links (customers) or the sidebar. */}
      <BottomNav items={nav.tabs} hideFrom="lg" />
    </div>
  );
}
