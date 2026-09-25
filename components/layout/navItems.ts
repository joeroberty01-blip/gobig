import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { NavItem } from "./NavLinks";

// Five tabs fit a phone. Provider verification moved from the tab bar to the dashboard in Phase 10.

export const customerNav = (t: Dictionary): NavItem[] => [
  { href: "/", label: t.nav.home, icon: "home", exact: true },
  { href: "/search", label: t.nav.search, icon: "search" },
  { href: "/requests", label: t.nav.requests, icon: "requests" },
  { href: "/saved", label: t.nav.saved, icon: "saved" },
  { href: "/account", label: t.nav.account, icon: "account" },
];

export const providerNav = (t: Dictionary): NavItem[] => [
  { href: "/provider", label: t.nav.dashboard, icon: "dashboard", exact: true },
  { href: "/provider/requests", label: t.nav.requests, icon: "requests" },
  { href: "/provider/insights", label: t.nav.insights, icon: "insights" },
  { href: "/provider/reviews", label: t.nav.reviews, icon: "reviews" },
  { href: "/provider/account", label: t.nav.account, icon: "account" },
];

export const adminNav = (t: Dictionary): NavItem[] => [
  { href: "/admin", label: t.nav.overview, icon: "dashboard", exact: true },
  { href: "/admin/users", label: t.nav.users, icon: "users" },
  { href: "/admin/verification", label: t.nav.verification, icon: "verification" },
  { href: "/admin/reports", label: t.adminPlatform.nav.reports, icon: "reports" },
  { href: "/admin/account", label: t.nav.account, icon: "account" },
  // Everything else (providers, catalogue, requests, reviews, billing, analytics, audit, settings)
  // is reached from the overview hub — five tabs fit a phone.
];
