import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/services/audit";
import { darDay } from "@/lib/services/connectEvents";

// Monetization (Phase 11): plans, subscriptions, admin-recorded payments, featured campaigns and
// the optional paid-leads quota. Nothing here touches trust: badges, verification levels, ratings
// and organic ranking are computed elsewhere and never read a plan (ADR-046).

type Db = Prisma.TransactionClient | typeof prisma;
const DAY = 86_400_000;
export const FREE_GALLERY_LIMIT = 12;

export type BillingError =
  | "notAllowed"
  | "planUnavailable"
  | "planNotPriced"
  | "subscriptionOpen"
  | "subscriptionNotFound"
  | "amountMismatch"
  | "paymentDuplicate"
  | "paymentNotFound"
  | "campaignNotFound"
  | "campaignInvalid"
  | "campaignNotAllowed"
  | "campaignStateInvalid";
export type BResult<T = object> = ({ ok: true } & T) | { ok: false; error: BillingError };

// ─── Settings ───────────────────────────────────────────────────────────────────────────────

const SETTINGS_ID = "default";
export type MonetizationSettings = {
  paidLeadsEnabled: boolean;
  featuredSlots: number;
  paymentInstructionsEn: string | null;
  paymentInstructionsSw: string | null;
};

export async function getSettings(db: Db = prisma): Promise<MonetizationSettings> {
  const row = await db.monetizationSettings.findUnique({ where: { id: SETTINGS_ID } });
  return {
    paidLeadsEnabled: row?.paidLeadsEnabled ?? false,
    featuredSlots: row?.featuredSlots ?? 2,
    paymentInstructionsEn: row?.paymentInstructionsEn ?? null,
    paymentInstructionsSw: row?.paymentInstructionsSw ?? null,
  };
}

export async function saveSettings(actorId: string, next: MonetizationSettings): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await getSettings(tx);
    await tx.monetizationSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...next, updatedById: actorId }, update: { ...next, updatedById: actorId } });
    await audit(tx, { actorId, action: "monetization.settings_saved", entityType: "MonetizationSettings", entityId: SETTINGS_ID, metadata: { before, after: next } });
  });
}

/**
 * When the payment instructions shown to providers last changed, and by whom (SEC-040). Read from
 * the append-only audit log, so it can't be edited away along with the text.
 */
export async function instructionsLastChanged(): Promise<{ at: Date; by: string | null } | null> {
  const rows = await prisma.auditLog.findMany({
    where: { action: "monetization.settings_saved", entityId: SETTINGS_ID },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: { createdAt: true, metadata: true, actorId: true },
  });
  for (const r of rows) {
    const m = r.metadata as { before?: Partial<MonetizationSettings>; after?: Partial<MonetizationSettings> } | null;
    if (m?.before?.paymentInstructionsEn !== m?.after?.paymentInstructionsEn || m?.before?.paymentInstructionsSw !== m?.after?.paymentInstructionsSw) {
      const actor = r.actorId ? await prisma.user.findUnique({ where: { id: r.actorId }, select: { name: true } }) : null;
      return { at: r.createdAt, by: actor?.name ?? null };
    }
  }
  return null;
}

// ─── Plans ──────────────────────────────────────────────────────────────────────────────────

export async function listPlans(opts: { activeOnly?: boolean } = {}) {
  return prisma.plan.findMany({ where: opts.activeOnly ? { isActive: true } : {}, orderBy: { sortOrder: "asc" } });
}

export type PlanEdit = {
  nameEn: string;
  nameSw: string;
  descriptionEn: string;
  descriptionSw: string;
  priceTzs: number | null;
  periodDays: number;
  galleryLimit: number;
  leadsPerMonth: number | null;
  priorityVerificationReview: boolean;
  allowsCampaigns: boolean;
  isActive: boolean;
};

export async function updatePlan(actorId: string, planId: string, edit: PlanEdit): Promise<BResult> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.plan.findUnique({ where: { id: planId } });
    if (!before) return { ok: false as const, error: "planUnavailable" as const };
    // The free plan is always free and always available.
    const data = before.code === "FREE" ? { ...edit, priceTzs: 0, isActive: true } : edit;
    await tx.plan.update({ where: { id: planId }, data });
    await audit(tx, {
      actorId,
      action: "plan.updated",
      entityType: "Plan",
      entityId: planId,
      metadata: { code: before.code, priceBefore: before.priceTzs, priceAfter: data.priceTzs, activeAfter: data.isActive },
    });
    return { ok: true as const };
  });
}

// ─── Subscriptions ──────────────────────────────────────────────────────────────────────────

const OPEN: ("PENDING_PAYMENT" | "ACTIVE" | "PAST_DUE")[] = ["PENDING_PAYMENT", "ACTIVE", "PAST_DUE"];

/** ACTIVE past its end date reads as EXPIRED (evaluated on read — no background job needed). */
export function effectiveSubscriptionStatus(s: { status: string; currentPeriodEnd: Date | null }, now = new Date()) {
  if (s.status === "ACTIVE" && s.currentPeriodEnd && s.currentPeriodEnd <= now) return "EXPIRED" as const;
  return s.status as "PENDING_PAYMENT" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
}

/** The plan in force for a provider right now: an unexpired ACTIVE subscription, else FREE. */
export async function currentPlan(providerId: string, now = new Date(), db: Db = prisma) {
  const sub = await db.subscription.findFirst({
    where: { providerId, status: "ACTIVE", currentPeriodEnd: { gt: now } },
    include: { plan: true },
  });
  if (sub) return { plan: sub.plan, subscription: sub };
  const free = await db.plan.findUnique({ where: { code: "FREE" } });
  return { plan: free, subscription: null };
}

export async function galleryLimitFor(providerId: string, db: Db = prisma): Promise<number> {
  return (await currentPlan(providerId, new Date(), db)).plan?.galleryLimit ?? FREE_GALLERY_LIMIT;
}

/** Provider asks for a paid plan. Creates a PENDING_PAYMENT subscription at today's price. */
export async function requestPlan(providerId: string, userId: string, planId: string, now = new Date()): Promise<BResult<{ subscriptionId: string }>> {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive || plan.code === "FREE") return { ok: false as const, error: "planUnavailable" as const };
    if (plan.priceTzs == null) return { ok: false as const, error: "planNotPriced" as const };
    const open = await tx.subscription.findFirst({ where: { providerId, status: { in: OPEN } }, select: { id: true, status: true, currentPeriodEnd: true } });
    if (open && effectiveSubscriptionStatus(open, now) !== "EXPIRED") return { ok: false as const, error: "subscriptionOpen" as const };
    if (open) await tx.subscription.update({ where: { id: open.id }, data: { status: "EXPIRED" } });
    const sub = await tx.subscription.create({
      data: { providerId, planId, priceTzs: plan.priceTzs, requestedById: userId, status: "PENDING_PAYMENT" },
      select: { id: true },
    });
    await audit(tx, { actorId: userId, action: "subscription.requested", entityType: "Subscription", entityId: sub.id, metadata: { plan: plan.code, priceTzs: plan.priceTzs } });
    return { ok: true as const, subscriptionId: sub.id };
  });
}

/** A provider may withdraw a request they haven't paid for yet. */
export async function cancelPendingPlan(providerId: string, userId: string): Promise<BResult> {
  const sub = await prisma.subscription.findFirst({ where: { providerId, status: "PENDING_PAYMENT" }, select: { id: true } });
  if (!sub) return { ok: false, error: "subscriptionNotFound" };
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await audit(tx, { actorId: userId, action: "subscription.cancelled", entityType: "Subscription", entityId: sub.id, metadata: { by: "provider" } });
  });
  return { ok: true };
}

export type PaymentInput = {
  amountTzs: number;
  method: "MPESA" | "TIGO_PESA" | "AIRTEL_MONEY" | "HALOPESA" | "BANK_TRANSFER" | "CASH" | "OTHER";
  reference: string;
  paidAt: Date;
};

async function insertPayment(tx: Prisma.TransactionClient, data: Prisma.PaymentUncheckedCreateInput): Promise<string | null> {
  const dup = await tx.payment.findUnique({ where: { method_reference: { method: data.method, reference: data.reference } }, select: { id: true } });
  if (dup) return null;
  return (await tx.payment.create({ data, select: { id: true } })).id;
}

/**
 * Admin records a payment for a subscription (mobile money / bank reference). The amount must be
 * exactly the agreed price. A pending subscription starts now; an active one is extended by one
 * period; a Featured plan also gets its Sponsored placement for the same dates.
 */
export async function recordSubscriptionPayment(actorId: string, subscriptionId: string, p: PaymentInput, now = new Date()): Promise<BResult<{ periodEnd: Date }>> {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: true } });
    if (!sub || !OPEN.includes(sub.status as (typeof OPEN)[number])) return { ok: false as const, error: "subscriptionNotFound" as const };
    if (p.amountTzs !== sub.priceTzs) return { ok: false as const, error: "amountMismatch" as const };
    const paymentId = await insertPayment(tx, { providerId: sub.providerId, subscriptionId, amountTzs: p.amountTzs, method: p.method, reference: p.reference, paidAt: p.paidAt, recordedById: actorId });
    if (!paymentId) return { ok: false as const, error: "paymentDuplicate" as const };

    const stillRunning = sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
    const start = stillRunning ? sub.currentPeriodStart! : now;
    const end = new Date((stillRunning ? sub.currentPeriodEnd!.getTime() : now.getTime()) + sub.plan.periodDays * DAY);
    await tx.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: end } });

    if (sub.plan.code === "FEATURED") {
      // The plan's Sponsored placement: one campaign that follows the subscription's dates.
      const existing = await tx.featuredCampaign.findFirst({ where: { providerId: sub.providerId, kind: "FEATURED_SEARCH", note: `plan:${sub.id}` }, select: { id: true } });
      const dates = { startsAt: darDay(start), endsAt: darDay(end), status: "ACTIVE" as const };
      if (existing) await tx.featuredCampaign.update({ where: { id: existing.id }, data: dates });
      else await tx.featuredCampaign.create({ data: { providerId: sub.providerId, kind: "FEATURED_SEARCH", note: `plan:${sub.id}`, priceTzs: 0, ...dates } });
    }
    await audit(tx, {
      actorId,
      action: stillRunning ? "subscription.renewed" : "subscription.activated",
      entityType: "Subscription",
      entityId: sub.id,
      metadata: { paymentId, amountTzs: p.amountTzs, method: p.method, periodEnd: end.toISOString() },
    });
    return { ok: true as const, periodEnd: end };
  });
}

export async function adminCancelSubscription(actorId: string, subscriptionId: string, reason: string): Promise<BResult> {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true, status: true, providerId: true } });
    if (!sub || !OPEN.includes(sub.status as (typeof OPEN)[number])) return { ok: false as const, error: "subscriptionNotFound" as const };
    await tx.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    // The plan's own Sponsored placement ends with it.
    await tx.featuredCampaign.updateMany({ where: { providerId: sub.providerId, note: `plan:${sub.id}`, status: { in: ["ACTIVE", "PAUSED"] } }, data: { status: "ENDED" } });
    await audit(tx, { actorId, action: "subscription.cancelled", entityType: "Subscription", entityId: sub.id, metadata: { by: "admin", reason } });
    return { ok: true as const };
  });
}

/** Marks a payment void (e.g. a reversed mobile-money transfer). The admin then decides the subscription. */
export async function voidPayment(actorId: string, paymentId: string, reason: string): Promise<BResult> {
  return prisma.$transaction(async (tx) => {
    const pay = await tx.payment.findUnique({ where: { id: paymentId }, select: { id: true, status: true } });
    if (!pay || pay.status !== "RECORDED") return { ok: false as const, error: "paymentNotFound" as const };
    await tx.payment.update({ where: { id: paymentId }, data: { status: "VOIDED", voidReason: reason } });
    await audit(tx, { actorId, action: "payment.voided", entityType: "Payment", entityId: paymentId, metadata: { reason } });
    return { ok: true as const };
  });
}

// ─── Featured campaigns ─────────────────────────────────────────────────────────────────────

export type CampaignInput = {
  kind: "FEATURED_SEARCH" | "SPONSORED_CATEGORY";
  serviceId: string | null;
  categoryId: string | null;
  locationId: string | null;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Provider asks for a campaign. Allowed on plans that include campaigns; targets must be services
 * the provider actually offers / categories they're in, so paid placement can't be bought for
 * unrelated searches.
 */
export async function requestCampaign(providerId: string, userId: string, input: CampaignInput, now = new Date()): Promise<BResult<{ campaignId: string }>> {
  const { plan } = await currentPlan(providerId, now);
  if (!plan?.allowsCampaigns) return { ok: false, error: "campaignNotAllowed" };
  const today = darDay(now);
  if (input.startsAt < today || input.endsAt < input.startsAt || input.endsAt.getTime() - input.startsAt.getTime() > 366 * DAY) return { ok: false, error: "campaignInvalid" };
  if (input.kind === "SPONSORED_CATEGORY" && !input.categoryId) return { ok: false, error: "campaignInvalid" };

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { profile: { select: { primaryCategoryId: true } }, services: { select: { serviceId: true, service: { select: { categoryId: true, category: { select: { parentId: true } } } } } } },
  });
  const serviceIds = new Set(provider?.services.map((s) => s.serviceId));
  const categoryIds = new Set(
    [provider?.profile?.primaryCategoryId, ...(provider?.services.flatMap((s) => [s.service.categoryId, s.service.category.parentId]) ?? [])].filter((x): x is string => !!x),
  );
  if (input.serviceId && !serviceIds.has(input.serviceId)) return { ok: false, error: "campaignInvalid" };
  if (input.categoryId && !categoryIds.has(input.categoryId)) return { ok: false, error: "campaignInvalid" };
  if (input.locationId && !(await prisma.location.count({ where: { id: input.locationId, isActive: true } }))) return { ok: false, error: "campaignInvalid" };

  return prisma.$transaction(async (tx) => {
    const c = await tx.featuredCampaign.create({ data: { providerId, ...input, requestedById: userId, status: "REQUESTED" }, select: { id: true } });
    await audit(tx, { actorId: userId, action: "campaign.requested", entityType: "FeaturedCampaign", entityId: c.id, metadata: { kind: input.kind } });
    return { ok: true as const, campaignId: c.id };
  });
}

type CampaignAction = "approve" | "reject" | "pause" | "resume" | "end";
const TRANSITIONS: Record<CampaignAction, { from: string[]; to: "PENDING_PAYMENT" | "REJECTED" | "PAUSED" | "ACTIVE" | "ENDED" }> = {
  approve: { from: ["REQUESTED"], to: "PENDING_PAYMENT" },
  reject: { from: ["REQUESTED", "PENDING_PAYMENT"], to: "REJECTED" },
  pause: { from: ["ACTIVE"], to: "PAUSED" },
  resume: { from: ["PAUSED"], to: "ACTIVE" },
  end: { from: ["ACTIVE", "PAUSED", "PENDING_PAYMENT"], to: "ENDED" },
};

/** Admin moves a campaign through its states. Approval sets the price the provider must pay. */
export async function updateCampaign(actorId: string, campaignId: string, action: CampaignAction, opts: { priceTzs?: number; note?: string } = {}): Promise<BResult> {
  return prisma.$transaction(async (tx) => {
    const c = await tx.featuredCampaign.findUnique({ where: { id: campaignId }, select: { id: true, status: true } });
    if (!c) return { ok: false as const, error: "campaignNotFound" as const };
    const t = TRANSITIONS[action];
    if (!t.from.includes(c.status)) return { ok: false as const, error: "campaignStateInvalid" as const };
    if (action === "approve" && (opts.priceTzs == null || opts.priceTzs <= 0)) return { ok: false as const, error: "campaignInvalid" as const };
    const moved = await tx.featuredCampaign.updateMany({
      where: { id: campaignId, status: c.status },
      data: { status: t.to, ...(action === "approve" ? { priceTzs: opts.priceTzs } : {}) },
    });
    if (moved.count !== 1) return { ok: false as const, error: "campaignStateInvalid" as const };
    await audit(tx, { actorId, action: `campaign.${action}`, entityType: "FeaturedCampaign", entityId: campaignId, metadata: { priceTzs: opts.priceTzs ?? null, note: opts.note ?? null } });
    return { ok: true as const };
  });
}

export async function recordCampaignPayment(actorId: string, campaignId: string, p: PaymentInput): Promise<BResult> {
  return prisma.$transaction(async (tx) => {
    const c = await tx.featuredCampaign.findUnique({ where: { id: campaignId }, select: { id: true, status: true, priceTzs: true, providerId: true } });
    if (!c || c.status !== "PENDING_PAYMENT") return { ok: false as const, error: "campaignStateInvalid" as const };
    if (p.amountTzs !== c.priceTzs) return { ok: false as const, error: "amountMismatch" as const };
    const paymentId = await insertPayment(tx, { providerId: c.providerId, campaignId, amountTzs: p.amountTzs, method: p.method, reference: p.reference, paidAt: p.paidAt, recordedById: actorId });
    if (!paymentId) return { ok: false as const, error: "paymentDuplicate" as const };
    await tx.featuredCampaign.update({ where: { id: campaignId }, data: { status: "ACTIVE" } });
    await audit(tx, { actorId, action: "campaign.activated", entityType: "FeaturedCampaign", entityId: campaignId, metadata: { paymentId, amountTzs: p.amountTzs, method: p.method } });
    return { ok: true as const };
  });
}

// ─── Placement (read side) ──────────────────────────────────────────────────────────────────

/** Deterministic daily rotation so eligible campaigns share the slots fairly. */
function rotate<T extends { id: string }>(items: T[], day: Date): T[] {
  const seed = day.getTime() / DAY;
  const score = (id: string) => {
    let h = seed | 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h ^ id.charCodeAt(i), 2654435761) >>> 0) % 4294967296;
    return h;
  };
  return [...items].sort((a, b) => score(a.id) - score(b.id));
}

/**
 * Sponsored slots for one search. Only providers already in the organic results (`candidateIds`)
 * are eligible — paid placement can repeat a relevant provider higher up, never insert an
 * unrelated one — and only campaigns whose targeting matches the search. The organic list is not
 * changed in any way.
 */
export async function sponsoredFor(input: {
  kind: "FEATURED_SEARCH" | "SPONSORED_CATEGORY";
  candidateIds: string[];
  serviceId: string | null;
  categoryIds: string[];
  locationIds: string[];
  now?: Date;
}): Promise<string[]> {
  if (!input.candidateIds.length) return [];
  const today = darDay(input.now);
  const settings = await getSettings();
  const slots = input.kind === "SPONSORED_CATEGORY" ? Math.min(1, settings.featuredSlots) : settings.featuredSlots;
  if (slots <= 0) return [];
  const campaigns = await prisma.featuredCampaign.findMany({
    where: {
      kind: input.kind,
      status: "ACTIVE",
      startsAt: { lte: today },
      endsAt: { gte: today },
      providerId: { in: input.candidateIds.slice(0, 500) },
      provider: { status: "ACTIVE", deletedAt: null },
      AND: [
        { OR: [{ serviceId: null }, ...(input.serviceId ? [{ serviceId: input.serviceId }] : [])] },
        { OR: [{ categoryId: null }, ...(input.categoryIds.length ? [{ categoryId: { in: input.categoryIds } }] : [])] },
        { OR: [{ locationId: null }, ...(input.locationIds.length ? [{ locationId: { in: input.locationIds } }] : [])] },
      ],
    },
    select: { id: true, providerId: true },
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of rotate(campaigns, today)) {
    if (seen.has(c.providerId)) continue;
    seen.add(c.providerId);
    out.push(c.providerId);
    if (out.length >= slots) break;
  }
  return out;
}

// ─── Paid leads ─────────────────────────────────────────────────────────────────────────────

/** Start of the current calendar month in Dar es Salaam, as an instant. */
function darMonthStart(now: Date): Date {
  const d = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 3 * 3_600_000);
}

/**
 * Whether the provider may start answering one more request this month. Unlimited unless an admin
 * has switched paid leads on AND the provider's plan has a monthly limit. A request counts once,
 * when the provider first responds to it.
 */
export async function leadAllowance(providerId: string, now = new Date(), db: Db = prisma): Promise<{ allowed: boolean; used: number; limit: number | null }> {
  const settings = await getSettings(db);
  const { plan } = await currentPlan(providerId, now, db);
  const limit = settings.paidLeadsEnabled ? (plan?.leadsPerMonth ?? null) : null;
  if (limit == null) return { allowed: true, used: 0, limit: null };
  const used = await db.requestMatch.count({ where: { providerId, firstResponseAt: { gte: darMonthStart(now) } } });
  return { allowed: used < limit, used, limit };
}

// ─── Admin lists ────────────────────────────────────────────────────────────────────────────

export async function adminSubscriptions(now = new Date()) {
  const rows = await prisma.subscription.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    include: {
      plan: { select: { code: true, nameEn: true, nameSw: true } },
      provider: { select: { slug: true, profile: { select: { displayName: true } } } },
      payments: { orderBy: { paidAt: "desc" }, select: { id: true, amountTzs: true, method: true, reference: true, paidAt: true, status: true } },
    },
  });
  return rows.map((r) => ({ ...r, effective: effectiveSubscriptionStatus(r, now) }));
}

export async function adminCampaigns() {
  return prisma.featuredCampaign.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    include: {
      provider: { select: { slug: true, profile: { select: { displayName: true } } } },
      service: { select: { nameEn: true, nameSw: true } },
      category: { select: { nameEn: true, nameSw: true } },
      location: { select: { name: true } },
      payments: { orderBy: { paidAt: "desc" }, select: { id: true, amountTzs: true, method: true, reference: true, paidAt: true, status: true } },
    },
  });
}

export async function providerBilling(providerId: string, now = new Date()) {
  const [current, open, campaigns, payments] = await Promise.all([
    currentPlan(providerId, now),
    prisma.subscription.findFirst({ where: { providerId, status: { in: OPEN } }, include: { plan: true }, orderBy: { createdAt: "desc" } }),
    prisma.featuredCampaign.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { service: { select: { nameEn: true, nameSw: true } }, category: { select: { nameEn: true, nameSw: true } }, location: { select: { name: true } } },
    }),
    prisma.payment.findMany({ where: { providerId }, orderBy: { paidAt: "desc" }, take: 20, select: { id: true, amountTzs: true, method: true, reference: true, paidAt: true, status: true } }),
  ]);
  return {
    plan: current.plan,
    active: current.subscription,
    open: open ? { ...open, effective: effectiveSubscriptionStatus(open, now) } : null,
    campaigns,
    payments,
    leads: await leadAllowance(providerId, now),
  };
}

export const _test = { rotate, darMonthStart, TRANSITIONS };
