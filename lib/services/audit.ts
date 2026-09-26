import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// Append-only audit trail (SEC-014). Rows can't be updated or deleted (DB triggers). Metadata must
// never contain passwords, tokens, document contents or other secrets — ids, slugs and short notes only.

export type AuditAction =
  | "admin.created"
  | "verification.requested"
  | "verification.submitted"
  | "verification.cancelled"
  | "verification.approved"
  | "verification.rejected"
  | "verification.changes_requested"
  | "verification.revoked"
  | "verification.document_viewed"
  | "verification.level_saved"
  | "review.hidden"
  | "review.restored"
  | "review.reports_dismissed"
  | "ranking.weights_saved"
  // Phase 11
  | "monetization.settings_saved"
  | "plan.updated"
  | "subscription.requested"
  | "subscription.activated"
  | "subscription.renewed"
  | "subscription.cancelled"
  | "payment.voided"
  | "campaign.requested"
  | "campaign.approve"
  | "campaign.reject"
  | "campaign.pause"
  | "campaign.resume"
  | "campaign.end"
  | "campaign.activated"
  // Phase 12
  | "platform.settings_saved"
  | "user.suspended"
  | "user.reactivated"
  | "provider.suspended"
  | "provider.reinstated"
  | "category.saved"
  | "service.saved"
  | "location.saved"
  | "request.cancelled_by_admin"
  | "report.resolved"
  | "report.dismissed"
  | "announcement.sent"
  | "report.viewed_conversation"
  // Phase 13
  | "security.totp_enabled"
  | "security.totp_reset"
  | "security.recovery_code_used"
  | "security.recovery_codes_regenerated";

export async function audit(
  db: Prisma.TransactionClient | typeof prisma,
  entry: { actorId: string | null; action: AuditAction; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue },
): Promise<void> {
  await db.auditLog.create({ data: entry });
}

export async function auditTrail(entityType: string, entityId: string) {
  const rows = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "asc" },
    select: { id: true, actorId: true, action: true, metadata: true, createdAt: true },
  });
  // actorId isn't a relation (history must survive user deletion), so names are looked up here.
  const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = new Map(
    (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } })).map((u) => [u.id, u]),
  );
  return rows.map((r) => ({ ...r, actor: r.actorId ? (actors.get(r.actorId) ?? null) : null }));
}
