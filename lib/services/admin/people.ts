import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/services/audit";
import { completionSnapshot } from "@/lib/services/providerProfile";
import { computeCompletion } from "@/lib/provider/completion";

// Admin: people (Phase 12). Suspending an account takes effect on the next request (sessions are
// checked against the database). Suspending a provider only removes the listing; the owner's
// account still works. Every change needs a reason and is audit-logged.

export type AdminError = "notFound" | "notAllowed" | "cannotSelf" | "superAdminOnly";
export type AResult<T = object> = ({ ok: true } & T) | { ok: false; error: AdminError };

export const PAGE_SIZE = 25;
type Actor = { id: string; role: string };

export async function searchUsers(input: { q: string; role: string | null; status: string | null; page: number }) {
  const q = input.q.trim();
  const digits = q.replace(/\D/g, "");
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(input.role ? { role: input.role as Prisma.EnumRoleFilter["equals"] } : {}),
    ...(input.status ? { status: input.status as Prisma.EnumUserStatusFilter["equals"] } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q.toLowerCase() } },
            ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true, lastLoginAt: true },
    }),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows };
}

export async function userDetail(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      locale: true,
      createdAt: true,
      lastLoginAt: true,
      memberships: { select: { role: true, provider: { select: { id: true, slug: true, status: true, profile: { select: { displayName: true } } } } } },
      _count: { select: { serviceRequests: true, reviews: true, reportsFiled: true, favorites: true } },
    },
  });
  if (!user) return null;
  const history = await prisma.auditLog.findMany({
    where: { entityType: "User", entityId: userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { action: true, metadata: true, createdAt: true, actorId: true },
  });
  return { ...user, history };
}

/**
 * Suspend / reactivate an account. Nobody can change their own status; only a super admin can
 * change an admin or super admin.
 */
export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED", reason: string): Promise<AResult> {
  if (actor.id === userId) return { ok: false, error: "cannotSelf" };
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.findFirst({ where: { id: userId, deletedAt: null }, select: { role: true, status: true } });
    if (!u) return { ok: false as const, error: "notFound" as const };
    if ((u.role === "ADMIN" || u.role === "SUPER_ADMIN") && actor.role !== "SUPER_ADMIN") return { ok: false as const, error: "superAdminOnly" as const };
    if (u.status === status) return { ok: true as const };
    await tx.user.update({ where: { id: userId }, data: { status } });
    await audit(tx, { actorId: actor.id, action: status === "SUSPENDED" ? "user.suspended" : "user.reactivated", entityType: "User", entityId: userId, metadata: { reason } });
    return { ok: true as const };
  });
}

export async function searchProvidersAdmin(input: { q: string; status: string | null; page: number }) {
  const q = input.q.trim();
  const where: Prisma.ProviderWhereInput = {
    deletedAt: null,
    ...(input.status ? { status: input.status as Prisma.EnumProviderStatusFilter["equals"] } : {}),
    ...(q ? { OR: [{ profile: { displayName: { contains: q, mode: "insensitive" } } }, { slug: { contains: q.toLowerCase() } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.provider.count({ where }),
    prisma.provider.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        status: true,
        createdAt: true,
        publishedAt: true,
        ratingAvg: true,
        ratingCount: true,
        verificationLevel: { select: { nameEn: true, nameSw: true } },
        profile: { select: { displayName: true, primaryLocation: { select: { name: true } } } },
        members: { where: { role: "OWNER" }, select: { user: { select: { id: true, name: true } } } },
        _count: { select: { reports: { where: { status: "OPEN" } } } },
      },
    }),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows };
}

/**
 * Suspend a listing (hidden from customers; the provider can't republish it) or reinstate it.
 * Reinstating makes it live again if the profile is complete, otherwise it returns to draft.
 */
export async function setProviderListing(actor: Actor, providerId: string, action: "suspend" | "reinstate", reason: string): Promise<AResult<{ status: string }>> {
  return prisma.$transaction(async (tx) => {
    const p = await tx.provider.findFirst({ where: { id: providerId, deletedAt: null }, select: { status: true } });
    if (!p) return { ok: false as const, error: "notFound" as const };
    let status: "SUSPENDED" | "ACTIVE" | "DRAFT";
    if (action === "suspend") {
      if (p.status === "SUSPENDED") return { ok: true as const, status: p.status };
      status = "SUSPENDED";
    } else {
      if (p.status !== "SUSPENDED") return { ok: false as const, error: "notAllowed" as const };
      status = computeCompletion(await completionSnapshot(tx, providerId)).canPublish ? "ACTIVE" : "DRAFT";
    }
    await tx.provider.update({ where: { id: providerId }, data: { status, ...(status === "ACTIVE" ? { publishedAt: new Date() } : {}) } });
    await audit(tx, {
      actorId: actor.id,
      action: action === "suspend" ? "provider.suspended" : "provider.reinstated",
      entityType: "Provider",
      entityId: providerId,
      metadata: { reason, from: p.status, to: status },
    });
    return { ok: true as const, status };
  });
}
