import { prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";

// Platform settings (Phase 12): limits and contacts that used to be constants, editable by a super
// admin without a deploy. Defaults equal the previous constants, so nothing changes until edited.

export type PlatformSettings = {
  supportEmail: string | null;
  supportPhone: string | null;
  supportWhatsapp: string | null;
  maxOpenRequests: number;
  maxRequestMatches: number;
  requestTtlDays: number;
  aiSearchEnabled: boolean;
  // Phase 17: feature switches and trip limits. (Automation rules moved to AutomationRule in Phase B;
  // the old columns autoHideReviewAtReports / requestReminderHours / driverAutoOfflineMin are retired.)
  ridesEnabled: boolean;
  deliveriesEnabled: boolean;
  tripRequestTtlMin: number;
  tripMaxRadiusKm: number;
  tripMaxKm: number;
  tripPurgeDays: number;
};

/** Everything except contact details — what the audit log records before/after. */
const TUNABLES = [
  "maxOpenRequests",
  "maxRequestMatches",
  "requestTtlDays",
  "aiSearchEnabled",
  "ridesEnabled",
  "deliveriesEnabled",
  "tripRequestTtlMin",
  "tripMaxRadiusKm",
  "tripMaxKm",
  "tripPurgeDays",
] as const;

export const PLATFORM_DEFAULTS: PlatformSettings = {
  supportEmail: null,
  supportPhone: null,
  supportWhatsapp: null,
  maxOpenRequests: 5,
  maxRequestMatches: 15,
  requestTtlDays: 14,
  aiSearchEnabled: true,
  ridesEnabled: true,
  deliveriesEnabled: true,
  tripRequestTtlMin: 10,
  tripMaxRadiusKm: 10,
  tripMaxKm: 80,
  tripPurgeDays: 30,
};

const ID = "default";
const CACHE_MS = 30_000;
let cached: { at: number; value: PlatformSettings } | null = null;

export async function getPlatformSettings(opts: { fresh?: boolean } = {}): Promise<PlatformSettings> {
  if (!opts.fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const row = await prisma.platformSettings.findUnique({ where: { id: ID } });
  const value: PlatformSettings = row
    ? {
        supportEmail: row.supportEmail,
        supportPhone: row.supportPhone,
        supportWhatsapp: row.supportWhatsapp,
        maxOpenRequests: row.maxOpenRequests,
        maxRequestMatches: row.maxRequestMatches,
        requestTtlDays: row.requestTtlDays,
        aiSearchEnabled: row.aiSearchEnabled,
        ...Object.fromEntries(TUNABLES.slice(4).map((k) => [k, row[k]])),
      } as PlatformSettings
    : { ...PLATFORM_DEFAULTS };
  cached = { at: Date.now(), value };
  return value;
}

export async function savePlatformSettings(actorId: string, next: PlatformSettings): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.platformSettings.findUnique({ where: { id: ID } });
    await tx.platformSettings.upsert({ where: { id: ID }, create: { id: ID, ...next, updatedById: actorId }, update: { ...next, updatedById: actorId } });
    await audit(tx, {
      actorId,
      action: "platform.settings_saved",
      entityType: "PlatformSettings",
      entityId: ID,
      metadata: {
        before: before ? Object.fromEntries(TUNABLES.map((k) => [k, before[k]])) : null,
        after: Object.fromEntries(TUNABLES.map((k) => [k, next[k]])),
      },
    });
  });
  cached = null;
}

export function _clearPlatformSettingsCache() {
  cached = null;
}
