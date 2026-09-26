import type { Dictionary } from "./dictionaries";

// Phase 13 (SEC-041): the root layout sends every visitor the dictionary without the admin-only
// sections (about a quarter of it). The admin layout adds a provider with the full dictionary, so
// client components under /admin still see everything. Server components always read the full
// dictionary through getServerDictionary(). `tests/unit/clientDictionary.test.ts` fails if a
// client component outside the admin area starts using a section removed here.
export const ADMIN_ONLY_SECTIONS = ["admin", "ranking", "security", "resetMessage"] as const;
/** Admin-only parts of otherwise public sections (Phase 17): read by server code and /admin screens only. */
export const ADMIN_ONLY_SUBSECTIONS = ["trust.admin", "billing.admin"] as const;

export function publicDictionary(t: Dictionary): Dictionary {
  const trimmed: Record<string, unknown> = { ...t };
  for (const k of ADMIN_ONLY_SECTIONS) trimmed[k] = {};
  // The report button on public pages needs these two parts of the admin text.
  trimmed.adminPlatform = { report: t.adminPlatform.report, reports: t.adminPlatform.reports };
  // Review-moderation wording is only shown on /admin/reviews.
  trimmed.ui = { ...t.ui, moderation: { hiddenTitle: "", hiddenIntro: "", noneHidden: "" } };
  trimmed.trust = { ...t.trust, admin: {} };
  trimmed.billing = { ...t.billing, admin: {} };
  trimmed.trips = { ...t.trips, adminTitle: "", adminIntro: "", adminOnline: "", adminActive: "", adminToday: "" };
  return trimmed as Dictionary;
}
