import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { NavItem } from "./NavLinks";

// Navigation (approved design, 2026-09-26). Phones and tablets: bottom tabs — for customers with
// a raised round search button in the middle (`fab`). Desktop: every area gets the navy sidebar
// with all of its sections (`side`).

export type Nav = { tabs: NavItem[]; side?: NavItem[] };

export const customerNav = (t: Dictionary): Nav => ({
  tabs: [
    { href: "/", label: t.nav.home, icon: "home", exact: true },
    { href: "/search", label: t.ui.nav.explore, icon: "search" },
    { href: "/requests", label: t.nav.requests, icon: "requests" },
    { href: "/saved", label: t.nav.saved, icon: "saved" },
    { href: "/account", label: t.ui.nav.profile, icon: "account" },
  ],
  side: [
    { href: "/", label: t.nav.home, icon: "home", exact: true },
    { href: "/search", label: t.ui.nav.explore, icon: "search" },
    { href: "/ask", label: t.ai.title, icon: "sparkles" },
    { href: "/requests", label: t.nav.requests, icon: "requests" },
    { href: "/saved", label: t.nav.saved, icon: "saved" },
    { href: "/account", label: t.ui.nav.profile, icon: "account" },
  ],
});

export const providerNav = (t: Dictionary): Nav => ({
  tabs: [
    { href: "/provider", label: t.nav.dashboard, icon: "dashboard", exact: true },
    { href: "/provider/requests", label: t.nav.requests, icon: "requests" },
    { href: "/provider/profile", label: t.ui.nav.profile, icon: "store" },
    { href: "/provider/insights", label: t.ui.nav.analytics, icon: "insights" },
    { href: "/provider/more", label: t.ui.nav.more, icon: "more", mobileOnly: true },
  ],
  side: [
    { href: "/provider", label: t.nav.dashboard, icon: "dashboard", exact: true },
    { href: "/provider/requests", label: t.nav.requests, icon: "requests" },
    { href: "/provider/profile", label: t.ui.nav.profile, icon: "store" },
    { href: "/provider/insights", label: t.ui.nav.analytics, icon: "insights" },
    { href: "/provider/reviews", label: t.nav.reviews, icon: "reviews" },
    { href: "/provider/verification", label: t.nav.verification, icon: "verification" },
    { href: "/provider/plan", label: t.billing.nav, icon: "plan" },
    { href: "/provider/notifications", label: t.requests.notifications.title, icon: "bell" },
    { href: "/provider/account", label: t.nav.account, icon: "account" },
  ],
});

export const adminNav = (t: Dictionary): Nav => {
  const L = t.adminPlatform.dashboard.links;
  return {
    tabs: [
      { href: "/admin", label: t.nav.overview, icon: "dashboard", exact: true },
      { href: "/admin/users", label: t.nav.users, icon: "users" },
      { href: "/admin/verification", label: t.nav.verification, icon: "verification" },
      { href: "/admin/reports", label: t.adminPlatform.nav.reports, icon: "reports" },
      { href: "/admin/account", label: t.nav.account, icon: "account" },
      // On phones everything else is reached from the overview hub.
    ],
    side: [
      { href: "/admin", label: t.nav.overview, icon: "dashboard", exact: true },
      { href: "/admin/users", label: L.users, icon: "users" },
      { href: "/admin/providers", label: L.providers, icon: "store" },
      { href: "/admin/verification", label: L.verification, icon: "verification" },
      { href: "/admin/reports", label: L.reports, icon: "reports" },
      { href: "/admin/reviews", label: L.reviews, icon: "reviews" },
      { href: "/admin/requests", label: L.requests, icon: "requests" },
      { href: "/admin/categories", label: L.categories, icon: "categories" },
      { href: "/admin/locations", label: L.locations, icon: "locations" },
      { href: "/admin/monetization", label: L.monetization, icon: "plan" },
      { href: "/admin/analytics", label: L.analytics, icon: "insights" },
      { href: "/admin/announcements", label: L.announcements, icon: "megaphone" },
      { href: "/admin/ranking", label: L.ranking, icon: "ranking" },
      { href: "/admin/audit", label: L.audit, icon: "audit" },
      { href: "/admin/settings", label: L.settings, icon: "settings" },
      { href: "/admin/account", label: t.nav.account, icon: "account" },
    ],
  };
};
