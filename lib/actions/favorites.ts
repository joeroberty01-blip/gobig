"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { toggleFavorite } from "@/lib/services/favorites";

// Phase 10: save / unsave a provider. The customer comes from the session; the provider must be live.

export async function toggleFavoriteAction(providerId: string, save: boolean): Promise<{ ok: true; saved: boolean } | { ok: false; error: "forbidden" | "rateLimited" | "notAllowed" | "providerUnavailable" }> {
  const user = await getCurrentUser();
  if (!can(user, "favorites:use")) return { ok: false, error: "forbidden" };
  if (typeof providerId !== "string" || providerId.length > 40 || typeof save !== "boolean") return { ok: false, error: "notAllowed" };
  if (!(await hit(LIMITS.favoritePerUser, user!.id)).ok) return { ok: false, error: "rateLimited" };
  const r = await toggleFavorite(user!, providerId, save);
  if (r.ok) revalidatePath("/saved");
  return r;
}
