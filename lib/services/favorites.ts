import { prisma } from "@/lib/db";

// Saved providers (Phase 10). A customer can save any live provider; providers see only the count.

export type FavResult = { ok: true; saved: boolean } | { ok: false; error: "notAllowed" | "providerUnavailable" };

export async function toggleFavorite(user: { id: string; role: string; status: string }, providerId: string, save: boolean): Promise<FavResult> {
  if (user.role !== "CUSTOMER" || user.status !== "ACTIVE") return { ok: false, error: "notAllowed" };
  if (!save) {
    await prisma.favorite.deleteMany({ where: { userId: user.id, providerId } });
    return { ok: true, saved: false };
  }
  const live = await prisma.provider.count({ where: { id: providerId, status: "ACTIVE", deletedAt: null } });
  if (!live) return { ok: false, error: "providerUnavailable" };
  await prisma.favorite.createMany({ data: [{ userId: user.id, providerId }], skipDuplicates: true });
  return { ok: true, saved: true };
}

export async function isFavorite(userId: string, providerId: string): Promise<boolean> {
  return (await prisma.favorite.count({ where: { userId, providerId } })) > 0;
}

/** The customer's saved providers, newest first (live ones only are shown by the caller). */
export async function favoriteProviderIds(userId: string): Promise<string[]> {
  const rows = await prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200, select: { providerId: true } });
  return rows.map((r) => r.providerId);
}
