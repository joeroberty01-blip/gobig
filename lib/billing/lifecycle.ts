import { prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { darDay } from "@/lib/services/connectEvents";
import { effectiveSubscriptionStatus } from "@/lib/services/billing";

// Automation Engine, Phase H: subscription and campaign lifecycle. Go Big never charges anyone:
// payments are made by the business (mobile money, bank, cash) and recorded by an admin. These
// helpers only find what to remind about, close campaigns whose dates have passed, and let an admin
// grant a free trial. An ended plan simply reads as Free (effectiveSubscriptionStatus).

const DAY = 86_400_000;
const LIMIT = 500;

/** Paid or trial plans that end within `days`. */
export function subscriptionsEnding(days: number, now: Date) {
  return prisma.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + days * DAY) } },
    select: { id: true, providerId: true, currentPeriodEnd: true, isTrial: true },
    take: LIMIT,
  });
}

/** Plans that ended in the last week (the notice goes once; older ones are left alone). */
export function subscriptionsEnded(now: Date) {
  return prisma.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lte: now, gt: new Date(now.getTime() - 7 * DAY) } },
    select: { id: true, providerId: true, currentPeriodEnd: true, isTrial: true },
    take: LIMIT,
  });
}

/** Plan requests still waiting for payment after `hours` (looked at for 30 days). */
export function paymentsPending(hours: number, now: Date) {
  return prisma.subscription.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(now.getTime() - hours * 3_600_000), gt: new Date(now.getTime() - 30 * DAY) } },
    select: { id: true, providerId: true },
    take: LIMIT,
  });
}

/** Running campaigns whose last day is within `days`. */
export function campaignsEnding(days: number, now: Date) {
  const today = darDay(now);
  return prisma.featuredCampaign.findMany({
    where: { status: "ACTIVE", endsAt: { gte: today, lte: new Date(today.getTime() + days * DAY) } },
    select: { id: true, providerId: true, endsAt: true },
    take: LIMIT,
  });
}

/** Marks running campaigns whose last day has passed as ENDED (they already stopped showing). */
export async function endFinishedCampaigns(now: Date) {
  const today = darDay(now);
  const due = await prisma.featuredCampaign.findMany({ where: { status: "ACTIVE", endsAt: { lt: today } }, select: { id: true, providerId: true }, take: LIMIT });
  if (!due.length) return [];
  await prisma.featuredCampaign.updateMany({ where: { id: { in: due.map((c) => c.id) }, status: "ACTIVE" }, data: { status: "ENDED" } });
  return due;
}

export type TrialError = "planUnavailable" | "subscriptionOpen" | "providerNotFound";

/**
 * An admin gives a business a paid plan free for `days`. No payment is recorded and nothing is
 * charged when it ends; the business is reminded before, then falls back to Free.
 */
export async function grantTrial(actorId: string, providerId: string, planId: string, days: number, now = new Date()): Promise<{ ok: true; subscriptionId: string } | { ok: false; error: TrialError }> {
  return prisma.$transaction(async (tx) => {
    const [plan, provider] = await Promise.all([tx.plan.findUnique({ where: { id: planId } }), tx.provider.findUnique({ where: { id: providerId }, select: { id: true, deletedAt: true } })]);
    if (!provider || provider.deletedAt) return { ok: false as const, error: "providerNotFound" as const };
    if (!plan || !plan.isActive || plan.code === "FREE") return { ok: false as const, error: "planUnavailable" as const };
    const open = await tx.subscription.findFirst({ where: { providerId, status: { in: ["PENDING_PAYMENT", "ACTIVE", "PAST_DUE"] } }, select: { id: true, status: true, currentPeriodEnd: true } });
    if (open && effectiveSubscriptionStatus(open, now) !== "EXPIRED") return { ok: false as const, error: "subscriptionOpen" as const };
    if (open) await tx.subscription.update({ where: { id: open.id }, data: { status: "EXPIRED" } });
    const sub = await tx.subscription.create({
      data: { providerId, planId, priceTzs: 0, isTrial: true, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + days * DAY), requestedById: actorId },
      select: { id: true },
    });
    await audit(tx, { actorId, action: "subscription.trial_granted", entityType: "Subscription", entityId: sub.id, metadata: { plan: plan.code, days } });
    return { ok: true as const, subscriptionId: sub.id };
  });
}
