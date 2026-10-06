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
import { Wordmark } from "./Logo";
import { SignOutLink } from "./SignOutButton";
import { MobileDrawer } from "./MobileDrawer";

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
  location,
  children,
}: {
  user: CurrentUser | null;
  nav: Nav;
  homeHref: string;
  areaLabel?: string;
  /** Customer area: the "Dar es Salaam ▾" pill beside the logo. */
  location?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = await getServerDictionary();
  // Customers and providers get the bell (admins have no notifications yet).
  const bellHref = user?.status === "ACTIVE" ? (user.role === "PROVIDER" ? "/provider/notifications" : user.role === "CUSTOMER" ? "/notifications" : null) : null;
  const unread = bellHref ? await unreadCount(user!.id) : 0;
  // Customers (top menu) have no desktop sidebar; the side list still fills the phone drawer.
  const sidebar = !!nav.side && !nav.top;
  const accountHref = user ? (user.role === "PROVIDER" ? "/provider/account" : user.role === "CUSTOMER" ? "/account" : "/admin/account") : "/login";
  const avatar = user && (
    <Link
      href={accountHref}
      aria-label={t.ui.nav.profile}
      className="grid size-10 place-items-center rounded-xl border-2 border-surface bg-gradient-to-br from-brand-600 to-night-900 text-sm font-bold text-white shadow-soft"
    >
      {user.name.trim().slice(0, 1).toUpperCase()}
    </Link>
  );

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
    <div className={`flex min-h-dvh ${sidebar ? "md:pl-64" : ""}`}>
      {sidebar && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 nav-gradient px-3 py-5 text-white md:flex">
          <Link href={homeHref} className="mb-6 flex items-center gap-2.5 px-3">
            <span className="flex flex-col leading-tight">
              <Wordmark className="text-xl" />
              {areaLabel && <span className="text-[11px] font-medium text-white/50">{areaLabel}</span>}
            </span>
          </Link>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <SideNav items={nav.side!} />
          </div>
          {!user && homeHref === "/" && (
            <Link href="/signup?role=provider" className="mt-4 block rounded-2xl bg-white/[0.06] p-4 transition hover:bg-white/10">
              <span className="block text-sm font-bold">{t.ui.home.listBusinessTitle}</span>
              <span className="mt-1 block text-xs leading-relaxed text-white/60">{t.ui.home.listBusinessBody}</span>
              <span className="mt-3 inline-flex min-h-8 items-center rounded-lg bg-brand-600 px-3 text-xs font-bold">{t.discovery.listBusiness}</span>
            </Link>
          )}
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
        <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/90 backdrop-blur-xl">
          <div className={`mx-auto flex h-14 items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4 ${sidebar ? "max-w-6xl md:px-6 lg:px-8" : nav.top ? "max-w-7xl lg:h-[4.5rem] lg:px-8" : "max-w-6xl"}`}>
            {nav.side && <MobileDrawer items={nav.side} homeHref={homeHref} userName={user?.name ?? null} hideFrom={sidebar ? "md" : "lg"} />}
            {/* The words are the logo (owner, 2026-10-06), so they show on phones too, next to the location pill. */}
            <Link href={homeHref} className={`flex shrink-0 items-center gap-2 ${sidebar ? "md:hidden" : ""}`}>
              <Wordmark className="text-lg text-ink sm:text-xl lg:text-[1.75rem]" tagline={nav.top ? t.ui.nav.tagline : undefined} />
              {areaLabel && <span className="hidden text-xs font-semibold text-ink-subtle uppercase sm:inline">{areaLabel}</span>}
            </Link>
            <div className="flex min-w-0 flex-1 items-center gap-4">
              {location}
              {!sidebar && (
                <div className="ml-auto">
                  <TopNav items={nav.top ?? nav.tabs} />
                </div>
              )}
            </div>
            <div className={location ? "" : "hidden sm:block"}>
              <LanguageSwitch />
            </div>
            {bell}
            {avatar}
            {!user && (
              <div className="hidden items-center gap-2 sm:flex">
                <ButtonLink href="/login" variant="secondary" className="min-h-10 rounded-full px-5">
                  {t.nav.login}
                </ButtonLink>
                <ButtonLink href="/signup" variant="primary" className="min-h-10 rounded-full px-6">
                  {t.nav.signup}
                </ButtonLink>
              </div>
            )}
          </div>
        </header>
        <main className={`pb-bottom-nav mx-auto w-full flex-1 px-4 py-6 md:pb-12 ${sidebar ? "max-w-6xl md:px-6 lg:px-8" : nav.top ? "max-w-7xl lg:px-8" : "max-w-6xl"}`}>{children}</main>
      </div>
      {/* Phones and tablets: bottom tabs. Desktop: header links (customers) or the sidebar. */}
      <BottomNav items={nav.tabs} hideFrom={sidebar ? "md" : "lg"} />
    </div>
  );
}
