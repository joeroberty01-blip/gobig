// Profile completeness: what's done, what's missing, and whether the profile may be published.
// Pure function over a plain snapshot so the dashboard, the wizard and tests agree exactly.

export type CompletionSnapshot = {
  displayName: string | null;
  primaryCategoryId: string | null;
  serviceCount: number;
  /** Services whose price the provider has set — an amount or a deliberate "Ask for price". */
  pricedServiceCount: number;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  socialCount: number;
  primaryLocationId: string | null;
  serviceAreaCount: number;
  openingHoursMode: "SCHEDULE" | "ALWAYS_OPEN" | "BY_APPOINTMENT";
  openingHoursCount: number;
  hasLogo: boolean;
  hasCover: boolean;
  galleryCount: number;
  enabledActionCount: number;
};

export type CompletionKey =
  | "name"
  | "category"
  | "services"
  | "description"
  | "phone"
  | "location"
  | "actions"
  | "whatsapp"
  | "online"
  | "areas"
  | "hours"
  | "pricing"
  | "logo"
  | "cover"
  | "gallery";

export type CompletionItem = { key: CompletionKey; done: boolean; weight: number; required: boolean };

export const MIN_DESCRIPTION = 30;
export const GALLERY_TARGET = 3;

export function computeCompletion(s: CompletionSnapshot): {
  percent: number;
  items: CompletionItem[];
  canPublish: boolean;
  missingRequired: CompletionKey[];
} {
  const items: CompletionItem[] = [
    // Required to publish — the minimum a customer needs to understand and reach the provider.
    { key: "name", weight: 10, required: true, done: !!s.displayName?.trim() },
    { key: "category", weight: 10, required: true, done: !!s.primaryCategoryId },
    { key: "services", weight: 10, required: true, done: s.serviceCount > 0 },
    { key: "description", weight: 10, required: true, done: (s.description?.trim().length ?? 0) >= MIN_DESCRIPTION },
    { key: "phone", weight: 10, required: true, done: !!s.phone },
    { key: "location", weight: 10, required: true, done: !!s.primaryLocationId },
    { key: "actions", weight: 0, required: true, done: s.enabledActionCount > 0 },
    // Optional — each makes the profile more useful and raises the percentage.
    { key: "whatsapp", weight: 5, required: false, done: !!s.whatsapp },
    { key: "online", weight: 5, required: false, done: !!s.website || s.socialCount > 0 },
    { key: "areas", weight: 5, required: false, done: s.serviceAreaCount > 0 },
    {
      key: "hours",
      weight: 5,
      required: false,
      done: s.openingHoursMode !== "SCHEDULE" || s.openingHoursCount > 0,
    },
    { key: "pricing", weight: 5, required: false, done: s.serviceCount > 0 && s.pricedServiceCount === s.serviceCount },
    { key: "logo", weight: 5, required: false, done: s.hasLogo },
    { key: "cover", weight: 5, required: false, done: s.hasCover },
    { key: "gallery", weight: 5, required: false, done: s.galleryCount >= GALLERY_TARGET },
  ];

  // Pricing earns partial credit per priced service; everything else is all-or-nothing.
  const earned = items.reduce((sum, i) => {
    if (i.key === "pricing" && !i.done && s.serviceCount > 0) return sum + (i.weight * s.pricedServiceCount) / s.serviceCount;
    return sum + (i.done ? i.weight : 0);
  }, 0);
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  const missingRequired = items.filter((i) => i.required && !i.done).map((i) => i.key);

  return { percent: Math.round((earned / total) * 100), items, canPublish: missingRequired.length === 0, missingRequired };
}
