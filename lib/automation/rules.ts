import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { notify, providerUserIds } from "@/lib/services/notifications";
import { refreshRating } from "@/lib/services/reviews";
import { autoOfflineDrivers } from "@/lib/services/trips";
import { defineRule, type AnyRule } from "./registry";

// The automation rules (Phase B moved the Phase 17 rules here unchanged). Every action they take is
// audit-logged with the system as the actor, and nothing is deleted: hidden reviews stay
// restorable by an admin. New rules are added to RULES at the bottom.

/** Hides a published review once it has `threshold` open reports from different people. */
export async function autoHideReportedReviews(threshold: number, now = new Date()): Promise<number> {
  if (threshold < 1) return 0;
  const groups = await prisma.reviewReport.groupBy({ by: ["reviewId"], where: { status: "OPEN", review: { status: "PUBLISHED" } }, _count: { _all: true } });
  const due = groups.filter((g) => g._count._all >= threshold).map((g) => g.reviewId);
  let hidden = 0;
  for (const reviewId of due) {
    const done = await prisma.$transaction(async (tx) => {
      const { count } = await tx.review.updateMany({ where: { id: reviewId, status: "PUBLISHED" }, data: { status: "HIDDEN" } });
      if (!count) return false;
      const review = await tx.review.findUniqueOrThrow({ where: { id: reviewId }, select: { providerId: true } });
      const reports = await tx.reviewReport.updateMany({ where: { reviewId, status: "OPEN" }, data: { status: "ACTIONED", resolvedAt: now } });
      await refreshRating(tx, review.providerId);
      await audit(tx, { actorId: null, action: "review.auto_hidden", entityType: "Review", entityId: reviewId, metadata: { providerId: review.providerId, reports: reports.count, threshold } });
      return true;
    });
    if (done) hidden++;
  }
  return hidden;
}

/** Reminds a matched business once when a customer's open request has waited `hours` for them. */
export async function remindUnansweredRequests(hours: number, now = new Date()): Promise<number> {
  if (hours < 1) return 0;
  const matches = await prisma.requestMatch.findMany({
    where: {
      status: "NOTIFIED",
      firstResponseAt: null,
      remindedAt: null,
      notifiedAt: { lt: new Date(now.getTime() - hours * 3_600_000) },
      request: { status: "OPEN", expiresAt: { gt: now } },
    },
    select: { id: true, providerId: true, requestId: true },
    take: 500,
  });
  let sent = 0;
  for (const m of matches) {
    // Claim first, so two runs can't both send the same reminder.
    const { count } = await prisma.requestMatch.updateMany({ where: { id: m.id, remindedAt: null }, data: { remindedAt: now } });
    if (!count) continue;
    await notify(prisma, await providerUserIds(prisma, m.providerId), "REQUEST_REMINDER", { requestId: m.requestId, matchId: m.id });
    sent++;
  }
  if (sent) await audit(prisma, { actorId: null, action: "automation.request_reminders", entityType: "Automation", entityId: "request-reminders", metadata: { sent, hours } });
  return sent;
}

// ─── Registry ───────────────────────────────────────────────────────────────────────────────

export const RULES: AnyRule[] = [
  defineRule({
    id: "review.auto-hide",
    group: "trust",
    trigger: { kind: "schedule", every: "5m" },
    enabledByDefault: false,
    params: z.object({ threshold: z.number().int().min(1).max(50) }),
    fields: [{ key: "threshold", min: 1, max: 50 }],
    defaults: { threshold: 3 },
    run: async ({ params, now }) => ({ hidden: await autoHideReportedReviews(params.threshold, now) }),
  }),
  defineRule({
    id: "request.unanswered-reminder",
    group: "providers",
    trigger: { kind: "schedule", every: "5m" },
    enabledByDefault: false,
    params: z.object({ hours: z.number().int().min(1).max(72) }),
    fields: [{ key: "hours", min: 1, max: 72 }],
    defaults: { hours: 4 },
    run: async ({ params, now }) => ({ sent: await remindUnansweredRequests(params.hours, now) }),
  }),
  defineRule({
    id: "driver.auto-offline",
    group: "trips",
    trigger: { kind: "schedule", every: "5m" },
    enabledByDefault: true,
    params: z.object({ afterMin: z.number().int().min(5).max(240) }),
    fields: [{ key: "afterMin", min: 5, max: 240 }],
    defaults: { afterMin: 30 },
    run: async ({ params, now }) => {
      const count = await autoOfflineDrivers(params.afterMin, now);
      if (count) await audit(prisma, { actorId: null, action: "automation.drivers_offline", entityType: "Automation", entityId: "drivers-offline", metadata: { count, afterMin: params.afterMin } });
      return { offline: count };
    },
  }),
];

export const RULE_IDS = RULES.map((r) => r.id);
