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
};

export const PLATFORM_DEFAULTS: PlatformSettings = {
  supportEmail: null,
  supportPhone: null,
  supportWhatsapp: null,
  maxOpenRequests: 5,
  maxRequestMatches: 15,
  requestTtlDays: 14,
  aiSearchEnabled: true,
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
      }
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
        before: before ? { maxOpenRequests: before.maxOpenRequests, maxRequestMatches: before.maxRequestMatches, requestTtlDays: before.requestTtlDays, aiSearchEnabled: before.aiSearchEnabled } : null,
        after: { maxOpenRequests: next.maxOpenRequests, maxRequestMatches: next.maxRequestMatches, requestTtlDays: next.requestTtlDays, aiSearchEnabled: next.aiSearchEnabled },
      },
    });
  });
  cached = null;
}

export function _clearPlatformSettingsCache() {
  cached = null;
}
