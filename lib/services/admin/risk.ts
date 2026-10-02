import { prisma } from "@/lib/db";
import type { RiskStatus } from "@/generated/prisma/client";
import { audit } from "@/lib/services/audit";

// Automation Engine, Phase F: admins review risk flags. Closing one only records the decision;
// any real action (suspending, hiding) is done on its own screen, where it's audited too.

export async function listRiskFlags(status: RiskStatus) {
  const flags = await prisma.riskFlag.findMany({
    where: { status },
    orderBy: status === "OPEN" ? [{ severity: "desc" }, { createdAt: "desc" }] : [{ resolvedAt: "desc" }],
    take: 100,
  });
  const providerIds = flags.filter((f) => f.subjectType === "PROVIDER").map((f) => f.subjectId);
  const userIds = flags.filter((f) => f.subjectType === "USER").map((f) => f.subjectId);
  const [providers, users] = await Promise.all([
    prisma.provider.findMany({ where: { id: { in: providerIds } }, select: { id: true, slug: true, profile: { select: { displayName: true } } } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const pMap = new Map(providers.map((p) => [p.id, { name: p.profile?.displayName ?? p.slug, href: `/p/${p.slug}` }]));
  const uMap = new Map(users.map((u) => [u.id, { name: u.name, href: `/admin/users/${u.id}` }]));
  return flags.map((f) => ({ ...f, subject: (f.subjectType === "PROVIDER" ? pMap : uMap).get(f.subjectId) ?? null }));
}

export const openRiskCount = () => prisma.riskFlag.count({ where: { status: "OPEN" } });

export async function resolveRiskFlag(adminId: string, id: string, outcome: "ACTIONED" | "DISMISSED", note: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const r = await tx.riskFlag.updateMany({ where: { id, status: "OPEN" }, data: { status: outcome, note, resolvedById: adminId, resolvedAt: new Date() } });
    if (r.count !== 1) return false;
    await audit(tx, { actorId: adminId, action: "risk.resolved", entityType: "RiskFlag", entityId: id, metadata: { outcome } });
    return true;
  });
}
