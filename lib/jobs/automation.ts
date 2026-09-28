import { prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { notify, providerUserIds } from "@/lib/services/notifications";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { refreshRating } from "@/lib/services/reviews";
import { autoOfflineDrivers } from "@/lib/services/trips";

// Phase 17 automation rules, switched and tuned in admin → Settings (0 = off). Run every few
// minutes by the job queue. Every action they take is audit-logged with the system as the actor,
// and nothing is deleted: hidden reviews stay restorable by an admin.

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

export async function runAutomation(now = new Date()) {
  const s = await getPlatformSettings({ fresh: true });
  const reviewsHidden = await autoHideReportedReviews(s.autoHideReviewAtReports, now);
  const reminders = await remindUnansweredRequests(s.requestReminderHours, now);
  const driversOffline = await autoOfflineDrivers(s.driverAutoOfflineMin, now);
  if (driversOffline) await audit(prisma, { actorId: null, action: "automation.drivers_offline", entityType: "Automation", entityId: "drivers-offline", metadata: { count: driversOffline, afterMin: s.driverAutoOfflineMin } });
  return { reviewsHidden, reminders, driversOffline };
}
