"use server";

import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { savePreferences } from "@/lib/notifications/preferences";

// Automation Engine, Phase C: a person saves their own notification choices (id from the session).
export async function saveNotificationPrefsAction(input: unknown): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!can(user, "notifications:view")) return { ok: false };
  if (!(await hit(LIMITS.notificationPrefsPerUser, user!.id)).ok) return { ok: false };
  const r = await savePreferences(user!.id, input);
  return { ok: r.ok };
}
