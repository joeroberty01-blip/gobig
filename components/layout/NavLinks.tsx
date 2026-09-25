"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, ChartColumn, ClipboardList, Flag, FolderTree, Heart, House, LayoutDashboard, MapPin, MessageSquareText, Search, UserRound, Users } from "lucide-react";
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
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Bottom tab bar, phones only. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav
      aria-label={t.nav.mainNavigation}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  active ? "text-brand-700" : "text-ink-subtle"
                }`}
              >
                <Icon aria-hidden className="size-6" strokeWidth={active ? 2.4 : 1.8} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Inline header links, tablet and desktop. */
export function TopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav aria-label={t.nav.mainNavigation} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "bg-brand-50 text-brand-700" : "text-ink-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon aria-hidden className="size-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
