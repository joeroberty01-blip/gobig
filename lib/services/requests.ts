import { randomUUID } from "node:crypto";
import { emitEvent } from "@/lib/automation/engine";
import { closeBookingWithRequest } from "@/lib/services/bookings";
import { can, type Actor } from "@/lib/permissions";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { deletePrivateObject, putPrivateObject, signedPrivateUrl } from "@/lib/storage";
import { publicReviewerName } from "@/lib/services/reviews";
import { searchProviders } from "@/lib/services/discovery";
import { parseSearchParams } from "@/lib/discovery/query";
import { notify, providerUserIds } from "@/lib/services/notifications";
import { leadAllowance } from "@/lib/services/billing";
import { getPlatformSettings } from "@/lib/services/platformSettings";

// Service requests (Phase 7). Framework-free; server actions authenticate and authorise the
// caller's role, and every function here re-checks that the caller is the request's customer or a
// member of a provider that was matched to it. A provider can never see a request it wasn't
// matched to, and sees the customer's contact details and address only once it is accepted.

// Defaults; the live values come from Admin → Settings (Phase 12, lib/services/platformSettings.ts).
export const MAX_MATCHES = 15;
export const MAX_OPEN_REQUESTS = 5;
export const MAX_REQUEST_PHOTOS = 5;
const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_DAYS = 14;
const MAX_TTL_DAYS = 60;

export type RequestError =
  | "notAllowed"
  | "tooManyOpen"
  | "serviceRequired"
  | "locationRequired"
  | "providerUnavailable"
  | "requestNotFound"
  | "requestClosed"
  | "quoteNotFound"
  | "tooManyPhotos"
  | "imageInvalid"
  | "imageTooLarge"
  | "leadLimitReached";

export type QResult<T = object> = ({ ok: true } & T) | { ok: false; error: RequestError };

type Tx = Prisma.TransactionClient;

/** OPEN requests past their expiry are shown and treated as expired (no background job needed). */
export function effectiveStatus(r: { status: string; expiresAt: Date }, now = new Date()): "OPEN" | "EXPIRED" | "ACCEPTED" | "COMPLETED" | "CANCELLED" {
  if (r.status === "OPEN" && r.expiresAt <= now) return "EXPIRED";
  return r.status as "OPEN" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
}

export function expiryFor(preferredDate: Date | null, now = new Date(), ttlDays = DEFAULT_TTL_DAYS): Date {
  const cap = new Date(now.getTime() + MAX_TTL_DAYS * DAY);
  // A dated job stays open until the end of that day (Dar time), otherwise two weeks.
  const wanted = preferredDate ? new Date(preferredDate.getTime() + DAY - 3 * 60 * 60 * 1000) : new Date(now.getTime() + ttlDays * DAY);
  return wanted < cap ? (wanted > now ? wanted : new Date(now.getTime() + DAY)) : cap;
}

export type NewRequest = {
  serviceId: string | null;
  categoryId: string | null;
  description: string;
  locationId: string;
  addressText: string | null;
  preferredDate: Date | null;
  preferredTime: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  contactPreference: "IN_APP" | "CALL" | "WHATSAPP" | "SMS";
  targetProviderSlug: string | null;
};

/**
 * Creates a request and matches it: a direct request goes to that one provider; otherwise up to
 * MAX_MATCHES live providers who offer the service (or category) and serve the area, in the same
 * order as search. The customer's own businesses are never matched.
 */
export async function createRequest(
  customer: { id: string; role: string; status: string },
  input: NewRequest,
  now = new Date(),
): Promise<QResult<{ requestId: string; matched: number }>> {
  if (customer.role !== "CUSTOMER" || customer.status !== "ACTIVE") return { ok: false, error: "notAllowed" };

  const open = await prisma.serviceRequest.count({ where: { customerId: customer.id, status: "OPEN", expiresAt: { gt: now } } });
  const limits = await getPlatformSettings();
  if (open >= limits.maxOpenRequests) return { ok: false, error: "tooManyOpen" };

  const [service, category, location] = await Promise.all([
    input.serviceId ? prisma.service.findFirst({ where: { id: input.serviceId, isActive: true }, select: { id: true, slug: true, categoryId: true } }) : null,
    input.categoryId ? prisma.category.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true, slug: true } }) : null,
    prisma.location.findFirst({ where: { id: input.locationId, isActive: true, type: { in: ["DISTRICT", "WARD", "NEIGHBOURHOOD"] } }, select: { id: true, slug: true } }),
  ]);
  if ((input.serviceId && !service) || (input.categoryId && !category) || (!service && !category)) return { ok: false, error: "serviceRequired" };
  if (!location) return { ok: false, error: "locationRequired" };

  const ownProviders = new Set(
    (await prisma.providerMember.findMany({ where: { userId: customer.id }, select: { providerId: true } })).map((m) => m.providerId),
  );

  let providerIds: string[];
  let targetProviderId: string | null = null;
  if (input.targetProviderSlug) {
    const target = await prisma.provider.findFirst({ where: { slug: input.targetProviderSlug, status: "ACTIVE", deletedAt: null, profile: { isNot: null } }, select: { id: true } });
    if (!target || ownProviders.has(target.id)) return { ok: false, error: "providerUnavailable" };
    targetProviderId = target.id;
    providerIds = [target.id];
  } else {
    const found = await searchProviders(
      { ...parseSearchParams({}), service: service?.slug ?? null, category: service ? null : (category?.slug ?? null), area: location.slug },
      now,
    );
    // Sample (test-deployment) businesses never receive real customers' requests (Phase C), nor do
    // businesses in away mode (Phase D).
    const candidates = found.results.filter((c) => !c.demo && !ownProviders.has(c.id)).map((c) => c.id);
    const away = new Set(
      (await prisma.provider.findMany({ where: { id: { in: candidates }, awayUntil: { gt: now } }, select: { id: true } })).map((p) => p.id),
    );
    providerIds = candidates.filter((id) => !away.has(id)).slice(0, limits.maxRequestMatches);
  }

  const request = await prisma.$transaction(async (tx) => {
    const r = await tx.serviceRequest.create({
      data: {
        customerId: customer.id,
        serviceId: service?.id ?? null,
        categoryId: category?.id ?? service?.categoryId ?? null,
        description: input.description,
        locationId: location.id,
        addressText: input.addressText,
        preferredDate: input.preferredDate,
        preferredTime: input.preferredTime,
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        contactPreference: input.contactPreference,
        targetProviderId,
        expiresAt: expiryFor(input.preferredDate, now, limits.requestTtlDays),
      },
      select: { id: true },
    });
    // Automation Engine (Phase C): events commit with the change they describe (ids only).
    await emitEvent(tx, { type: "request.created", subjectType: "ServiceRequest", subjectId: r.id, payload: { matched: providerIds.length, direct: !!targetProviderId } });
    if (providerIds.length) {
      await tx.requestMatch.createMany({ data: providerIds.map((providerId) => ({ requestId: r.id, providerId })) });
      const members = await tx.providerMember.findMany({ where: { providerId: { in: providerIds } }, select: { userId: true } });
      await notify(tx, members.map((m) => m.userId), "REQUEST_NEW", { requestId: r.id });
    }
    return r;
  });
  return { ok: true, requestId: request.id, matched: providerIds.length };
}

// ─── Photos (private bucket) ────────────────────────────────────────────────────────────────

export async function addRequestPhoto(customerId: string, requestId: string, input: Buffer): Promise<QResult<{ photoId: string }>> {
  const request = await prisma.serviceRequest.findFirst({ where: { id: requestId, customerId, status: "OPEN" }, select: { id: true, _count: { select: { photos: true } } } });
  if (!request) return { ok: false, error: "requestNotFound" };
  if (request._count.photos >= MAX_REQUEST_PHOTOS) return { ok: false, error: "tooManyPhotos" };
  if (input.byteLength > 8 * 1024 * 1024) return { ok: false, error: "imageTooLarge" };
  let data: Buffer;
  try {
    const img = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) return { ok: false, error: "imageInvalid" };
    // Re-encoded: EXIF (incl. GPS of the customer's home) is dropped.
    data = await img.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return { ok: false, error: "imageInvalid" };
  }
  if (data.byteLength > 5 * 1024 * 1024) return { ok: false, error: "imageTooLarge" };
  const key = `requests/${requestId}/${randomUUID()}.jpg`;
  await putPrivateObject(key, data, "image/jpeg");
  try {
    const photo = await prisma.requestPhoto.create({ data: { requestId, storageKey: key, bytes: data.byteLength }, select: { id: true } });
    return { ok: true, photoId: photo.id };
  } catch (err) {
    await deletePrivateObject(key).catch(() => undefined);
    throw err;
  }
}

/** Signed 5-minute URL if the viewer is the customer, a member of a matched provider, or an admin. */
export async function requestPhotoUrl(viewer: { id: string; role: string; status?: string; mfaPending?: boolean }, photoId: string): Promise<string | null> {
  const photo = await prisma.requestPhoto.findUnique({
    where: { id: photoId },
    select: { storageKey: true, request: { select: { customerId: true, matches: { select: { provider: { select: { members: { select: { userId: true } } } } } } } } },
  });
  if (!photo) return null;
  // Phase 16 (SEC-046): through can(), so an admin who hasn't passed two-factor sees nothing.
  const isAdmin = can(viewer as Actor, "requests:oversee");
  const allowed =
    isAdmin ||
    photo.request.customerId === viewer.id ||
    photo.request.matches.some((m) => m.provider.members.some((mm) => mm.userId === viewer.id));
  return allowed ? signedPrivateUrl(photo.storageKey, 300) : null;
}

// ─── Reading ────────────────────────────────────────────────────────────────────────────────

const requestCore = {
  id: true,
  status: true,
  description: true,
  preferredDate: true,
  preferredTime: true,
  budgetMin: true,
  budgetMax: true,
  contactPreference: true,
  expiresAt: true,
  createdAt: true,
  acceptedProviderId: true,
  targetProviderId: true,
  service: { select: { nameEn: true, nameSw: true } },
  category: { select: { nameEn: true, nameSw: true } },
  location: { select: { name: true, type: true, parent: { select: { name: true } } } },
  photos: { orderBy: { createdAt: "asc" as const }, select: { id: true } },
} satisfies Prisma.ServiceRequestSelect;

export async function listCustomerRequests(customerId: string) {
  const rows = await prisma.serviceRequest.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { ...requestCore, _count: { select: { matches: true, quotes: true } } },
  });
  return rows.map((r) => ({ ...r, effective: effectiveStatus(r) }));
}

/** Full view for the request's own customer: matches, quotes, conversations. */
export async function customerRequest(customerId: string, requestId: string) {
  const r = await prisma.serviceRequest.findFirst({
    where: { id: requestId, customerId },
    select: {
      ...requestCore,
      addressText: true,
      acceptedAt: true,
      completedAt: true,
      cancelledAt: true,
      matches: {
        orderBy: { notifiedAt: "asc" },
        select: {
          id: true,
          status: true,
          notifiedAt: true,
          firstResponseAt: true,
          provider: {
            select: {
              id: true,
              slug: true,
              ratingAvg: true,
              ratingCount: true,
              verificationLevel: { select: { nameEn: true, nameSw: true } },
              profile: { select: { displayName: true, phone: true, whatsapp: true } },
            },
          },
          messages: { orderBy: { createdAt: "asc" }, take: 200, select: { id: true, senderRole: true, body: true, createdAt: true, readAt: true } },
        },
      },
      quotes: { select: { providerId: true, amount: true, note: true, validUntil: true, status: true, updatedAt: true, createdAt: true } },
    },
  });
  if (!r) return null;
  return {
    ...r,
    effective: effectiveStatus(r),
    matches: r.matches.map((m) => ({
      ...m,
      quote: r.quotes.find((q) => q.providerId === m.provider.id) ?? null,
      // The accepted provider's numbers become visible to the customer too, for arranging the job.
      provider: {
        ...m.provider,
        profile: m.provider.profile
          ? {
              displayName: m.provider.profile.displayName,
              phone: r.acceptedProviderId === m.provider.id ? m.provider.profile.phone : null,
              whatsapp: r.acceptedProviderId === m.provider.id ? m.provider.profile.whatsapp : null,
            }
          : null,
      },
      unread: m.messages.filter((x) => x.senderRole === "PROVIDER" && !x.readAt).length,
    })),
  };
}

export async function providerInbox(providerId: string) {
  const rows = await prisma.requestMatch.findMany({
    where: { providerId },
    orderBy: { notifiedAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      notifiedAt: true,
      request: { select: requestCore },
      messages: { where: { senderRole: "CUSTOMER", readAt: null }, select: { id: true } },
    },
  });
  return rows.map((m) => ({ ...m, effective: effectiveStatus(m.request), unread: m.messages.length }));
}

/**
 * A request as a matched provider may see it. Customer contact details and street address are
 * included only when this provider has been accepted.
 */
export async function providerRequest(providerId: string, requestId: string) {
  const match = await prisma.requestMatch.findUnique({
    where: { requestId_providerId: { requestId, providerId } },
    select: {
      id: true,
      status: true,
      messages: { orderBy: { createdAt: "asc" }, take: 200, select: { id: true, senderRole: true, body: true, createdAt: true, readAt: true } },
      request: {
        select: {
          ...requestCore,
          addressText: true,
          customer: { select: { name: true, phone: true, email: true } },
          quotes: { where: { providerId }, select: { amount: true, note: true, validUntil: true, status: true } },
        },
      },
    },
  });
  if (!match) return null;
  const { request } = match;
  const accepted = request.acceptedProviderId === providerId;
  return {
    matchId: match.id,
    matchStatus: match.status,
    messages: match.messages,
    quote: request.quotes[0] ?? null,
    accepted,
    request: {
      ...request,
      effective: effectiveStatus(request),
      customerName: publicReviewerName(request.customer.name),
      addressText: accepted ? request.addressText : null,
      customerContact: accepted ? { phone: request.customer.phone, email: request.customer.email } : null,
      customer: undefined,
      quotes: undefined,
    },
  };
}

// ─── Provider responses ─────────────────────────────────────────────────────────────────────

async function openMatch(tx: Tx, providerId: string, requestId: string, now: Date) {
  return tx.requestMatch.findFirst({
    where: {
      requestId,
      providerId,
      status: { in: ["NOTIFIED", "INTERESTED", "QUOTED"] },
      request: { status: "OPEN", expiresAt: { gt: now } },
    },
    select: { id: true, firstResponseAt: true, request: { select: { customerId: true } } },
  });
}

export async function expressInterest(providerId: string, requestId: string, now = new Date()): Promise<QResult> {
  return prisma.$transaction(async (tx) => {
    const m = await openMatch(tx, providerId, requestId, now);
    if (!m) return { ok: false as const, error: "requestClosed" as const };
    // Phase 11: with paid leads switched on, a first response uses one of the month's leads.
    if (!m.firstResponseAt && !(await leadAllowance(providerId, now, tx)).allowed) return { ok: false as const, error: "leadLimitReached" as const };
    await tx.requestMatch.updateMany({ where: { id: m.id, status: "NOTIFIED" }, data: { status: "INTERESTED" } });
    if (!m.firstResponseAt) await tx.requestMatch.update({ where: { id: m.id }, data: { firstResponseAt: now } });
    await notify(tx, [m.request.customerId], "REQUEST_INTEREST", { requestId, matchId: m.id });
    await emitEvent(tx, { type: "request.responded", subjectType: "ServiceRequest", subjectId: requestId, payload: { providerId, kind: "interest" } });
    return { ok: true as const };
  });
}

export async function declineRequest(providerId: string, requestId: string): Promise<QResult> {
  const r = await prisma.requestMatch.updateMany({
    where: { requestId, providerId, status: { in: ["NOTIFIED", "INTERESTED", "QUOTED"] } },
    data: { status: "DECLINED" },
  });
  if (r.count === 1) await prisma.quote.updateMany({ where: { requestId, providerId, status: "SENT" }, data: { status: "WITHDRAWN" } });
  return r.count === 1 ? { ok: true } : { ok: false, error: "requestClosed" };
}

export async function sendQuote(
  providerId: string,
  requestId: string,
  input: { amount: number; note: string | null; validUntil: Date | null },
  now = new Date(),
): Promise<QResult> {
  return prisma.$transaction(async (tx) => {
    const m = await openMatch(tx, providerId, requestId, now);
    if (!m) return { ok: false as const, error: "requestClosed" as const };
    if (!m.firstResponseAt && !(await leadAllowance(providerId, now, tx)).allowed) return { ok: false as const, error: "leadLimitReached" as const };
    await tx.quote.upsert({
      where: { requestId_providerId: { requestId, providerId } },
      create: { requestId, providerId, ...input },
      update: { ...input, status: "SENT" },
    });
    await tx.requestMatch.update({ where: { id: m.id }, data: { status: "QUOTED", firstResponseAt: m.firstResponseAt ?? now } });
    await notify(tx, [m.request.customerId], "QUOTE_NEW", { requestId, matchId: m.id });
    await emitEvent(tx, { type: "request.responded", subjectType: "ServiceRequest", subjectId: requestId, payload: { providerId, kind: "quote" } });
    return { ok: true as const };
  });
}

export async function withdrawQuote(providerId: string, requestId: string): Promise<QResult> {
  const r = await prisma.quote.updateMany({ where: { requestId, providerId, status: "SENT" }, data: { status: "WITHDRAWN" } });
  if (r.count === 1) await prisma.requestMatch.updateMany({ where: { requestId, providerId, status: "QUOTED" }, data: { status: "INTERESTED" } });
  return r.count === 1 ? { ok: true } : { ok: false, error: "quoteNotFound" };
}

// ─── Messages ───────────────────────────────────────────────────────────────────────────────

/**
 * Sends a message in one customer↔provider conversation. The sender's side is derived from who
 * they are (the request's customer, or a member of the matched provider) — never from the client.
 */
export async function sendMessage(userId: string, matchId: string, body: string, now = new Date()): Promise<QResult> {
  return prisma.$transaction(async (tx) => {
    const m = await tx.requestMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        providerId: true,
        firstResponseAt: true,
        request: { select: { id: true, customerId: true, status: true, acceptedProviderId: true } },
        provider: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!m) return { ok: false as const, error: "requestNotFound" as const };
    const role = m.request.customerId === userId ? "CUSTOMER" : m.provider.members.some((x) => x.userId === userId) ? "PROVIDER" : null;
    if (!role) return { ok: false as const, error: "requestNotFound" as const };
    // Conversations close when the request is cancelled, or for providers who declined / weren't chosen.
    if (m.request.status === "CANCELLED" || m.status === "DECLINED" || m.status === "NOT_SELECTED") {
      return { ok: false as const, error: "requestClosed" as const };
    }
    if (role === "PROVIDER" && !m.firstResponseAt && !(await leadAllowance(m.providerId, now, tx)).allowed) {
      return { ok: false as const, error: "leadLimitReached" as const };
    }
    await tx.message.create({ data: { matchId, senderId: userId, senderRole: role, body } });
    if (role === "PROVIDER" && !m.firstResponseAt) await tx.requestMatch.update({ where: { id: matchId }, data: { firstResponseAt: now } });
    const recipients = role === "CUSTOMER" ? m.provider.members.map((x) => x.userId) : [m.request.customerId];
    await notify(tx, recipients, "MESSAGE_NEW", { requestId: m.request.id, matchId });
    return { ok: true as const };
  });
}

/** Marks the other side's messages in a conversation as read, for a participant only. */
export async function markConversationRead(userId: string, matchId: string): Promise<void> {
  const m = await prisma.requestMatch.findUnique({
    where: { id: matchId },
    select: { request: { select: { customerId: true } }, provider: { select: { members: { select: { userId: true } } } } },
  });
  if (!m) return;
  const other = m.request.customerId === userId ? "PROVIDER" : m.provider.members.some((x) => x.userId === userId) ? "CUSTOMER" : null;
  if (!other) return;
  await prisma.message.updateMany({ where: { matchId, senderRole: other, readAt: null }, data: { readAt: new Date() } });
}

// ─── Customer decisions ─────────────────────────────────────────────────────────────────────

/**
 * The customer chooses a provider (with or without a quote). Only one acceptance can win: the
 * request row is claimed with a status check inside the update.
 */
export async function acceptProvider(customerId: string, requestId: string, providerId: string, now = new Date()): Promise<QResult> {
  return prisma.$transaction(async (tx) => {
    const match = await tx.requestMatch.findFirst({
      where: { requestId, providerId, status: { in: ["INTERESTED", "QUOTED"] }, request: { customerId } },
      select: { id: true },
    });
    if (!match) return { ok: false as const, error: "requestNotFound" as const };
    const claimed = await tx.serviceRequest.updateMany({
      where: { id: requestId, customerId, status: "OPEN", expiresAt: { gt: now } },
      data: { status: "ACCEPTED", acceptedProviderId: providerId, acceptedAt: now },
    });
    if (claimed.count !== 1) return { ok: false as const, error: "requestClosed" as const };

    await tx.quote.updateMany({ where: { requestId, providerId, status: "SENT" }, data: { status: "ACCEPTED" } });
    await tx.quote.updateMany({ where: { requestId, providerId: { not: providerId }, status: "SENT" }, data: { status: "DECLINED" } });
    await tx.requestMatch.update({ where: { id: match.id }, data: { status: "ACCEPTED" } });
    const others = await tx.requestMatch.findMany({
      where: { requestId, providerId: { not: providerId }, status: { in: ["NOTIFIED", "INTERESTED", "QUOTED"] } },
      select: { providerId: true },
    });
    await tx.requestMatch.updateMany({ where: { requestId, providerId: { in: others.map((o) => o.providerId) } }, data: { status: "NOT_SELECTED" } });

    await notify(tx, await providerUserIds(tx, providerId), "QUOTE_ACCEPTED", { requestId, matchId: match.id });
    const otherUsers = await tx.providerMember.findMany({ where: { providerId: { in: others.map((o) => o.providerId) } }, select: { userId: true } });
    await notify(tx, otherUsers.map((u) => u.userId), "REQUEST_NOT_SELECTED", { requestId });
    await emitEvent(tx, { type: "request.accepted", subjectType: "ServiceRequest", subjectId: requestId, payload: { providerId } });
    return { ok: true as const };
  });
}

export async function cancelRequest(customerId: string, requestId: string, now = new Date()): Promise<QResult> {
  return prisma.$transaction(async (tx) => {
    const r = await tx.serviceRequest.updateMany({
      where: { id: requestId, customerId, status: { in: ["OPEN", "ACCEPTED"] } },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    if (r.count !== 1) return { ok: false as const, error: "requestClosed" as const };
    await tx.quote.updateMany({ where: { requestId, status: { in: ["SENT", "ACCEPTED"] } }, data: { status: "DECLINED" } });
    const active = await tx.requestMatch.findMany({ where: { requestId, status: { notIn: ["DECLINED", "NOT_SELECTED"] } }, select: { providerId: true } });
    const users = await tx.providerMember.findMany({ where: { providerId: { in: active.map((a) => a.providerId) } }, select: { userId: true } });
    await notify(tx, users.map((u) => u.userId), "REQUEST_CANCELLED", { requestId });
    await closeBookingWithRequest(tx, requestId, "CANCELLED", now);
    await emitEvent(tx, { type: "request.cancelled", subjectType: "ServiceRequest", subjectId: requestId });
    return { ok: true as const };
  });
}

export async function completeRequest(customerId: string, requestId: string, now = new Date()): Promise<QResult> {
  return prisma.$transaction(async (tx) => {
    const req = await tx.serviceRequest.findFirst({ where: { id: requestId, customerId, status: "ACCEPTED" }, select: { acceptedProviderId: true } });
    if (!req?.acceptedProviderId) return { ok: false as const, error: "requestClosed" as const };
    await tx.serviceRequest.update({ where: { id: requestId }, data: { status: "COMPLETED", completedAt: now } });
    await notify(tx, await providerUserIds(tx, req.acceptedProviderId), "REQUEST_COMPLETED", { requestId });
    await closeBookingWithRequest(tx, requestId, "COMPLETED", now);
    await emitEvent(tx, { type: "request.completed", subjectType: "ServiceRequest", subjectId: requestId, payload: { providerId: req.acceptedProviderId } });
    return { ok: true as const };
  });
}

/** Did this customer complete a job with this provider? (For "verified job" reviews.) */
export async function hasCompletedJob(customerId: string, providerId: string): Promise<boolean> {
  return (await prisma.serviceRequest.count({ where: { customerId, acceptedProviderId: providerId, status: "COMPLETED" } })) > 0;
}

// ─── Seen state ─────────────────────────────────────────────────────────────────────────────

/**
 * Opening a request marks, for this viewer only, its notifications and the other side's messages
 * in the viewer's own conversations as read.
 */
export async function markRequestSeen(userId: string, requestId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, data: { path: ["requestId"], equals: requestId } },
    data: { readAt: new Date() },
  });
  const matches = await prisma.requestMatch.findMany({
    where: { requestId, OR: [{ request: { customerId: userId } }, { provider: { members: { some: { userId } } } }] },
    select: { id: true },
  });
  for (const m of matches) await markConversationRead(userId, m.id);
}

/** Service (or category) names for a set of requests, to write notification text. */
export async function requestLabels(requestIds: string[]) {
  const rows = await prisma.serviceRequest.findMany({
    where: { id: { in: [...new Set(requestIds)] } },
    select: { id: true, service: { select: { nameEn: true, nameSw: true } }, category: { select: { nameEn: true, nameSw: true } } },
  });
  return new Map(rows.map((r) => [r.id, r.service ?? r.category]));
}
