import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";
import type { CurrentUser } from "@/lib/session";
import { unreadCount } from "@/lib/services/notifications";
import { fill } from "@/lib/i18n/dictionaries";
import { ButtonLink } from "@/components/ui";
import { Bell } from "lucide-react";
import { BottomNav, TopNav, type NavItem } from "./NavLinks";
import { LanguageSwitch } from "./LanguageSwitch";

/**
 * Mobile-first frame shared by the customer, provider and admin areas: a slim header, the page,
 * and a bottom tab bar on phones (inline header links from tablet width up).
 */
export async function AppShell({
  user,
  items,
  homeHref,
  areaLabel,
  children,
}: {
  user: CurrentUser | null;
  items: NavItem[];
  homeHref: string;
  areaLabel?: string;
  children: React.ReactNode;
}) {
  const { t } = await getServerDictionary();
  // Customers and providers get the bell (admins have no notifications yet).
  const bellHref = user?.status === "ACTIVE" ? (user.role === "PROVIDER" ? "/provider/notifications" : user.role === "CUSTOMER" ? "/notifications" : null) : null;
  const unread = bellHref ? await unreadCount(user!.id) : 0;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href={homeHref} className="flex items-baseline gap-2">
            <span className="text-lg font-black tracking-tight text-brand-700">{t.app.name}</span>
            {areaLabel && <span className="text-xs font-semibold uppercase text-ink-subtle">{areaLabel}</span>}
          </Link>
          <div className="ml-4 flex-1">
            <TopNav items={items} />
          </div>
          {bellHref && (
            <Link
              href={bellHref}
              aria-label={unread ? `${t.requests.notifications.bell} — ${fill(t.requests.notifications.unread, { count: unread })}` : t.requests.notifications.bell}
              className="relative grid size-10 place-items-center rounded-full text-ink-muted hover:bg-canvas"
            >
              <Bell aria-hidden className="size-5" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          )}
          <LanguageSwitch />
          {!user && (
            <div className="hidden items-center gap-2 sm:flex">
              <ButtonLink href="/login" variant="ghost" className="min-h-9">
                {t.nav.login}
              </ButtonLink>
              <ButtonLink href="/signup" className="min-h-9">
                {t.nav.signup}
              </ButtonLink>
            </div>
          )}
        </div>
      </header>
      <main className="pb-bottom-nav mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:pb-10">{children}</main>
      <BottomNav items={items} />
    </div>
  );
}
