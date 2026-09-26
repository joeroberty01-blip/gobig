"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  ChartColumn,
  ClipboardList,
  CreditCard,
  Ellipsis,
  Flag,
  FolderTree,
  Heart,
  House,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageSquareText,
  ScrollText,
  Search,
  Settings,
  SlidersHorizontal,
  Store,
  UserRound,
  Users,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

// Icons are referenced by name because server components can't pass components to the client.
const ICONS = {
  home: House,
  search: Search,
  account: UserRound,
  dashboard: LayoutDashboard,
  users: Users,
  categories: FolderTree,
  locations: MapPin,
  verification: BadgeCheck,
  reviews: MessageSquareText,
  requests: ClipboardList,
  saved: Heart,
  insights: ChartColumn,
  reports: Flag,
  store: Store,
  more: Ellipsis,
  plan: CreditCard,
  bell: Bell,
  megaphone: Megaphone,
  ranking: SlidersHorizontal,
  audit: ScrollText,
  settings: Settings,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean; mobileOnly?: boolean };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Bottom tab bar on phones (and on tablets for the sidebar areas). */
export function BottomNav({ items, hideFrom = "md" }: { items: NavItem[]; hideFrom?: "md" | "lg" }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav
      aria-label={t.nav.mainNavigation}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl ${hideFrom === "lg" ? "lg:hidden" : "md:hidden"}`}
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-brand-700" : "text-ink-subtle hover:text-ink"
                }`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-brand-50" : "group-active:bg-canvas"}`}>
                  <Icon aria-hidden className="size-5.5" strokeWidth={active ? 2.3 : 1.8} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Inline header links, tablet and desktop (customer area). */
export function TopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav aria-label={t.nav.mainNavigation} className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {items
          .filter((i) => !i.mobileOnly)
          .map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "text-ink" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                  {active && <span aria-hidden className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-brand-500" />}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}

/** Dark sidebar for the provider and admin areas on large screens. */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav aria-label={t.nav.mainNavigation}>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                  active ? "bg-brand-500/15 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon aria-hidden className={`size-4.5 ${active ? "text-brand-500" : ""}`} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
