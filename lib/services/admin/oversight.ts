import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";
import { effectiveStatus } from "@/lib/services/requests";

// Admin oversight (Phase 12): service requests and user reports (SEC-028).
// Privacy: admins see request metadata, not conversations. A conversation's messages are shown to
// an admin only inside a report about that conversation, and every such view is audit-logged.

export const PAGE_SIZE = 25;
export type OversightError = "notFound" | "notAllowed" | "alreadyReported" | "requestClosed";
export type OResult<T = object> = ({ ok: true } & T) | { ok: false; error: OversightError };

// ─── Requests ───────────────────────────────────────────────────────────────────────────────

export async function listRequestsAdmin(input: { status: string | null; page: number }) {
  const where: Prisma.ServiceRequestWhereInput = input.status ? { status: input.status as Prisma.EnumRequestStatusFilter["equals"] } : {};
  const [total, rows] = await Promise.all([
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        description: true,
        service: { select: { nameEn: true, nameSw: true } },
        category: { select: { nameEn: true, nameSw: true } },
        location: { select: { name: true } },
        customer: { select: { id: true, name: true } },
        acceptedProvider: { select: { slug: true, profile: { select: { displayName: true } } } },
        _count: { select: { matches: true, quotes: true } },
      },
    }),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows: rows.map((r) => ({ ...r, effective: effectiveStatus(r) })) };
}

/** Cancels a request (spam, abuse, duplicate). Everyone involved is told; nothing is deleted. */
export async function adminCancelRequest(actorId: string, requestId: string, reason: string): Promise<OResult> {
  return prisma.$transaction(async (tx) => {
    const r = await tx.serviceRequest.findUnique({ where: { id: requestId }, select: { status: true, customerId: true } });
    if (!r) return { ok: false as const, error: "notFound" as const };
    if (r.status === "CANCELLED" || r.status === "COMPLETED") return { ok: false as const, error: "requestClosed" as const };
    await tx.serviceRequest.update({ where: { id: requestId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await tx.quote.updateMany({ where: { requestId, status: { in: ["SENT", "ACCEPTED"] } }, data: { status: "DECLINED" } });
    const active = await tx.requestMatch.findMany({ where: { requestId, status: { notIn: ["DECLINED", "NOT_SELECTED"] } }, select: { providerId: true } });
    const members = await tx.providerMember.findMany({ where: { providerId: { in: active.map((a) => a.providerId) } }, select: { userId: true } });
    await notify(tx, members.map((m) => m.userId), "REQUEST_CANCELLED", { requestId });
    await notify(tx, [r.customerId], "REQUEST_CANCELLED_BY_ADMIN", { requestId });
    await audit(tx, { actorId, action: "request.cancelled_by_admin", entityType: "ServiceRequest", entityId: requestId, metadata: { reason } });
    return { ok: true as const };
  });
}

// ─── Reports ────────────────────────────────────────────────────────────────────────────────

export type ReportInput = {
  targetType: "PROVIDER" | "REQUEST" | "CONVERSATION";
  /** PROVIDER: provider id · REQUEST: request id · CONVERSATION: match id */
  targetId: string;
  reason: "SPAM" | "FAKE" | "FRAUD" | "OFFENSIVE" | "UNSAFE" | "OTHER";
  note: string | null;
};

/**
 * A signed-in user reports something they can actually see: a live provider (not their own), a
 * request their business was matched to, or a conversation they're part of.
 */
export async function fileReport(user: { id: string; role: string; status: string }, input: ReportInput): Promise<OResult> {
  if (user.status !== "ACTIVE" || (user.role !== "CUSTOMER" && user.role !== "PROVIDER")) return { ok: false, error: "notAllowed" };
  let providerId: string | null = null;

  if (input.targetType === "PROVIDER") {
    const p = await prisma.provider.findFirst({ where: { id: input.targetId, status: "ACTIVE", deletedAt: null }, select: { id: true, members: { select: { userId: true } } } });
    if (!p) return { ok: false, error: "notFound" };
    if (p.members.some((m) => m.userId === user.id)) return { ok: false, error: "notAllowed" };
    providerId = p.id;
  } else if (input.targetType === "REQUEST") {
    const m = await prisma.requestMatch.findFirst({ where: { requestId: input.targetId, provider: { members: { some: { userId: user.id } } } }, select: { providerId: true } });
    if (!m) return { ok: false, error: "notFound" };
  } else {
    const m = await prisma.requestMatch.findUnique({
      where: { id: input.targetId },
      select: { providerId: true, request: { select: { customerId: true } }, provider: { select: { members: { select: { userId: true } } } } },
    });
    if (!m || (m.request.customerId !== user.id && !m.provider.members.some((x) => x.userId === user.id))) return { ok: false, error: "notFound" };
    providerId = m.providerId;
  }

  const dup = await prisma.report.findUnique({ where: { reporterId_targetType_targetId: { reporterId: user.id, targetType: input.targetType, targetId: input.targetId } }, select: { id: true } });
  if (dup) return { ok: false, error: "alreadyReported" };
  await prisma.report.create({ data: { ...input, providerId, reporterId: user.id } });
  return { ok: true };
}

export async function listReports(status: "OPEN" | "RESOLVED" | "DISMISSED") {
  const rows = await prisma.report.findMany({
    where: { status },
    orderBy: { createdAt: status === "OPEN" ? "asc" : "desc" },
    take: 100,
    select: {
      id: true,
      targetType: true,
      targetId: true,
      reason: true,
      note: true,
      status: true,
      resolution: true,
      createdAt: true,
      resolvedAt: true,
      reporter: { select: { id: true, name: true, role: true } },
      provider: { select: { id: true, slug: true, status: true, profile: { select: { displayName: true } } } },
    },
  });
  // How many open reports each target has (repeat reports are a signal).
  const counts = await prisma.report.groupBy({ by: ["targetType", "targetId"], where: { status: "OPEN", targetId: { in: rows.map((r) => r.targetId) } }, _count: { _all: true } });
  return rows.map((r) => ({ ...r, openForTarget: counts.find((c) => c.targetType === r.targetType && c.targetId === r.targetId)?._count._all ?? 0 }));
}

/** Detail for deciding a report. Conversation messages are included only here, and the view is logged. */
export async function reportDetail(actorId: string, reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, targetType: true, targetId: true, reason: true, note: true, status: true, resolution: true, createdAt: true, reporter: { select: { id: true, name: true, role: true } } },
  });
  if (!report) return null;
  let request = null;
  let conversation = null;
  if (report.targetType === "REQUEST") {
    request = await prisma.serviceRequest.findUnique({
      where: { id: report.targetId },
      select: { id: true, status: true, description: true, createdAt: true, customer: { select: { id: true, name: true } }, service: { select: { nameEn: true, nameSw: true } }, location: { select: { name: true } } },
    });
  }
  if (report.targetType === "CONVERSATION") {
    conversation = await prisma.requestMatch.findUnique({
      where: { id: report.targetId },
      select: {
        id: true,
        request: { select: { id: true, customer: { select: { id: true, name: true } } } },
        provider: { select: { id: true, slug: true, profile: { select: { displayName: true } } } },
        messages: { orderBy: { createdAt: "asc" }, take: 200, select: { id: true, senderRole: true, body: true, createdAt: true } },
      },
    });
    await audit(prisma, { actorId, action: "report.viewed_conversation", entityType: "Report", entityId: reportId, metadata: { matchId: report.targetId } });
  }
  return { ...report, request, conversation };
}

export async function resolveReport(actorId: string, reportId: string, outcome: "RESOLVED" | "DISMISSED", resolution: string): Promise<OResult> {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.report.updateMany({ where: { id: reportId, status: "OPEN" }, data: { status: outcome, resolution, resolvedById: actorId, resolvedAt: new Date() } });
    if (moved.count !== 1) return { ok: false as const, error: "notFound" as const };
    await audit(tx, { actorId, action: outcome === "RESOLVED" ? "report.resolved" : "report.dismissed", entityType: "Report", entityId: reportId, metadata: { resolution } });
    return { ok: true as const };
  });
}

// ─── Announcements ──────────────────────────────────────────────────────────────────────────

export type AnnouncementInput = { titleEn: string; titleSw: string; bodyEn: string; bodySw: string; audience: "ALL" | "CUSTOMERS" | "PROVIDERS" };

/** Sends an in-app announcement to every active customer and/or provider (never to admins). */
export async function sendAnnouncement(actorId: string, input: AnnouncementInput): Promise<OResult<{ recipients: number }>> {
  const roles = input.audience === "CUSTOMERS" ? (["CUSTOMER"] as const) : input.audience === "PROVIDERS" ? (["PROVIDER"] as const) : (["CUSTOMER", "PROVIDER"] as const);
  const users = await prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE", role: { in: [...roles] } }, select: { id: true } });
  const a = await prisma.announcement.create({ data: { ...input, createdById: actorId, recipients: users.length }, select: { id: true } });
  for (let i = 0; i < users.length; i += 1000) {
    await prisma.notification.createMany({ data: users.slice(i, i + 1000).map((u) => ({ userId: u.id, type: "ANNOUNCEMENT", data: { announcementId: a.id } })) });
  }
  await audit(prisma, { actorId, action: "announcement.sent", entityType: "Announcement", entityId: a.id, metadata: { audience: input.audience, recipients: users.length } });
  return { ok: true, recipients: users.length };
}

export async function listAnnouncements() {
  return prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
}
