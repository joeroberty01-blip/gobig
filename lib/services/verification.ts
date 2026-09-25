import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { deletePrivateObject, putPrivateObject, signedPrivateUrl } from "@/lib/storage";
import { audit } from "@/lib/services/audit";

// Provider verification (Phase 5). Framework-free; actions in lib/actions/verification.ts and
// lib/actions/adminVerification.ts authenticate and authorise before calling these.
// Providers can request and upload; ONLY reviewers change a provider's verification level.

import type { DocumentType } from "@/lib/verification-types";
export { DOCUMENT_TYPES, type DocumentType } from "@/lib/verification-types";

export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const MAX_DOCS_PER_REQUEST = 10;
const OPEN: ("DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED")[] = ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"];
const EDITABLE: ("DRAFT" | "CHANGES_REQUESTED")[] = ["DRAFT", "CHANGES_REQUESTED"];

export type VerificationError =
  | "levelUnavailable"
  | "alreadyVerified"
  | "requestOpen"
  | "requestNotFound"
  | "requestLocked"
  | "tooManyDocuments"
  | "documentInvalid"
  | "documentTooLarge"
  | "documentsMissing"
  | "noteRequired"
  | "notAllowed";

export type VResult<T = object> = ({ ok: true } & T) | { ok: false; error: VerificationError };

export async function activeLevels() {
  return prisma.verificationLevel.findMany({ where: { isActive: true }, orderBy: { rank: "asc" } });
}

/** A provider's current badge, open request (if any) and past requests, for their own page. */
export async function providerVerificationState(providerId: string) {
  const [provider, requests] = await Promise.all([
    prisma.provider.findUniqueOrThrow({
      where: { id: providerId },
      select: { status: true, verifiedAt: true, verificationLevel: true },
    }),
    prisma.verificationRequest.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        providerNote: true,
        decisionNote: true,
        submittedAt: true,
        reviewedAt: true,
        createdAt: true,
        level: true,
        documents: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, mimeType: true, bytes: true, createdAt: true } },
      },
    }),
  ]);
  return { ...provider, open: requests.find((r) => OPEN.includes(r.status as (typeof OPEN)[number])) ?? null, history: requests };
}

export async function startRequest(providerId: string, levelId: string): Promise<VResult<{ requestId: string }>> {
  const [level, provider] = await Promise.all([
    prisma.verificationLevel.findFirst({ where: { id: levelId, isActive: true } }),
    prisma.provider.findUniqueOrThrow({ where: { id: providerId }, select: { status: true, verificationLevel: { select: { rank: true } } } }),
  ]);
  if (!level) return { ok: false, error: "levelUnavailable" };
  if (provider.status === "SUSPENDED") return { ok: false, error: "notAllowed" };
  if (provider.verificationLevel && provider.verificationLevel.rank >= level.rank) return { ok: false, error: "alreadyVerified" };
  try {
    const request = await prisma.$transaction(async (tx) => {
      const r = await tx.verificationRequest.create({ data: { providerId, levelId }, select: { id: true } });
      await audit(tx, { actorId: null, action: "verification.requested", entityType: "VerificationRequest", entityId: r.id, metadata: { providerId, level: level.slug } });
      return r;
    });
    return { ok: true, requestId: request.id };
  } catch (err) {
    // Partial unique index: one open request per provider.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: "requestOpen" };
    throw err;
  }
}

async function editableRequest(providerId: string, requestId: string) {
  return prisma.verificationRequest.findFirst({ where: { id: requestId, providerId, status: { in: EDITABLE } }, select: { id: true } });
}

/**
 * Validates and stores one document in the private bucket. Images are re-encoded (JPEG, EXIF and
 * GPS stripped, capped at 2400 px); PDFs are accepted only when they really start with a PDF header.
 */
export async function processDocument(input: Buffer): Promise<{ ok: true; data: Buffer; mimeType: string; ext: string } | { ok: false; error: VerificationError }> {
  if (input.byteLength === 0) return { ok: false, error: "documentInvalid" };
  if (input.byteLength > MAX_DOC_BYTES) return { ok: false, error: "documentTooLarge" };
  if (input.subarray(0, 5).toString("latin1") === "%PDF-") return { ok: true, data: input, mimeType: "application/pdf", ext: "pdf" };
  try {
    const image = sharp(input, { failOn: "error", limitInputPixels: 60_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) return { ok: false, error: "documentInvalid" };
    const data = await image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    return { ok: true, data, mimeType: "image/jpeg", ext: "jpg" };
  } catch {
    return { ok: false, error: "documentInvalid" };
  }
}

export async function addDocument(providerId: string, requestId: string, type: DocumentType, input: Buffer): Promise<VResult<{ documentId: string }>> {
  const request = await editableRequest(providerId, requestId);
  if (!request) return { ok: false, error: "requestLocked" };
  const count = await prisma.verificationDocument.count({ where: { requestId } });
  if (count >= MAX_DOCS_PER_REQUEST) return { ok: false, error: "tooManyDocuments" };

  const processed = await processDocument(input);
  if (!processed.ok) return processed;

  // Random key; never the user's filename (no path traversal, nothing personal in the key).
  const key = `verification/${providerId}/${requestId}/${randomUUID()}.${processed.ext}`;
  await putPrivateObject(key, processed.data, processed.mimeType);
  try {
    const doc = await prisma.verificationDocument.create({
      data: { requestId, type, storageKey: key, mimeType: processed.mimeType, bytes: processed.data.byteLength },
      select: { id: true },
    });
    return { ok: true, documentId: doc.id };
  } catch (err) {
    await deletePrivateObject(key).catch(() => undefined);
    throw err;
  }
}

export async function removeDocument(providerId: string, documentId: string): Promise<VResult> {
  const doc = await prisma.verificationDocument.findFirst({
    where: { id: documentId, request: { providerId, status: { in: EDITABLE } } },
    select: { id: true, storageKey: true },
  });
  if (!doc) return { ok: false, error: "requestLocked" };
  await prisma.verificationDocument.delete({ where: { id: doc.id } });
  await deletePrivateObject(doc.storageKey).catch(() => undefined);
  return { ok: true };
}

export async function submitRequest(providerId: string, requestId: string, note: string | null, actorId: string): Promise<VResult> {
  const request = await prisma.verificationRequest.findFirst({
    where: { id: requestId, providerId, status: { in: EDITABLE } },
    select: { id: true, level: { select: { slug: true, requiredDocuments: true } }, documents: { select: { type: true } } },
  });
  if (!request) return { ok: false, error: "requestLocked" };
  const have = new Set(request.documents.map((d) => d.type));
  if (request.documents.length === 0 || request.level.requiredDocuments.some((t) => !have.has(t))) return { ok: false, error: "documentsMissing" };

  await prisma.$transaction(async (tx) => {
    await tx.verificationRequest.update({ where: { id: requestId }, data: { status: "SUBMITTED", providerNote: note, submittedAt: new Date() } });
    await audit(tx, { actorId, action: "verification.submitted", entityType: "VerificationRequest", entityId: requestId, metadata: { level: request.level.slug, documents: request.documents.length } });
  });
  return { ok: true };
}

export async function cancelRequest(providerId: string, requestId: string, actorId: string): Promise<VResult> {
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.verificationRequest.updateMany({ where: { id: requestId, providerId, status: { in: OPEN } }, data: { status: "CANCELLED" } });
    if (r.count === 1) await audit(tx, { actorId, action: "verification.cancelled", entityType: "VerificationRequest", entityId: requestId });
    return r.count;
  });
  return updated === 1 ? { ok: true } : { ok: false, error: "requestNotFound" };
}

// ─── Reviewer side ──────────────────────────────────────────────────────────────────────────

export async function reviewQueue(status: "SUBMITTED" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" = "SUBMITTED", now = new Date()) {
  const rows = await prisma.verificationRequest.findMany({
    where: { status },
    orderBy: status === "SUBMITTED" ? { submittedAt: "asc" } : { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      level: { select: { nameEn: true, nameSw: true } },
      provider: {
        select: {
          slug: true,
          profile: { select: { displayName: true } },
          // Phase 11: plans with priority review are looked at first. Only the ORDER changes —
          // reviewers apply the same rules and the decision is never influenced by a plan.
          subscriptions: {
            where: { status: "ACTIVE", currentPeriodEnd: { gt: now }, plan: { priorityVerificationReview: true } },
            select: { id: true },
            take: 1,
          },
        },
      },
      _count: { select: { documents: true } },
    },
  });
  const withPriority = rows.map(({ provider: { subscriptions, ...provider }, ...r }) => ({ ...r, provider, priority: subscriptions.length > 0 }));
  return status === "SUBMITTED" ? [...withPriority.filter((r) => r.priority), ...withPriority.filter((r) => !r.priority)] : withPriority;
}

export async function requestForReview(requestId: string) {
  return prisma.verificationRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      providerNote: true,
      decisionNote: true,
      submittedAt: true,
      reviewedAt: true,
      reviewedBy: { select: { name: true } },
      level: true,
      documents: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, mimeType: true, bytes: true, createdAt: true } },
      provider: {
        select: {
          id: true,
          slug: true,
          status: true,
          verificationLevel: { select: { nameEn: true, nameSw: true, rank: true } },
          members: { where: { role: "OWNER" }, select: { user: { select: { name: true, email: true, phone: true, createdAt: true } } } },
          profile: { select: { displayName: true, phone: true, primaryLocation: { select: { name: true } } } },
        },
      },
    },
  });
}

export type Decision = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

/**
 * Records a reviewer decision on a SUBMITTED request. The status check happens inside the update,
 * so two reviewers deciding at once can't both succeed.
 */
export async function decide(reviewerId: string, requestId: string, decision: Decision, note: string | null): Promise<VResult> {
  if (decision !== "APPROVE" && !note?.trim()) return { ok: false, error: "noteRequired" };
  const status = decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.verificationRequest.updateMany({
      where: { id: requestId, status: "SUBMITTED" },
      data: { status, decisionNote: note?.trim() || null, reviewedById: reviewerId, reviewedAt: now },
    });
    if (claimed.count !== 1) return { ok: false as const, error: "requestLocked" as const };

    const r = await tx.verificationRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { providerId: true, level: { select: { id: true, slug: true, rank: true } }, provider: { select: { verificationLevel: { select: { rank: true } } } } },
    });
    if (decision === "APPROVE") {
      // Never downgrade: approving a lower tier keeps an existing higher one.
      const current = r.provider.verificationLevel?.rank ?? 0;
      if (r.level.rank >= current) {
        await tx.provider.update({ where: { id: r.providerId }, data: { verificationLevelId: r.level.id, verifiedAt: now } });
      }
    }
    const action = decision === "APPROVE" ? "verification.approved" : decision === "REJECT" ? "verification.rejected" : "verification.changes_requested";
    await audit(tx, { actorId: reviewerId, action, entityType: "VerificationRequest", entityId: requestId, metadata: { providerId: r.providerId, level: r.level.slug } });
    return { ok: true as const };
  });
}

/** Removes a provider's badge (e.g. documents later found invalid). */
export async function revoke(reviewerId: string, providerId: string, reason: string): Promise<VResult> {
  if (!reason.trim()) return { ok: false, error: "noteRequired" };
  return prisma.$transaction(async (tx) => {
    const p = await tx.provider.findUnique({ where: { id: providerId }, select: { verificationLevel: { select: { slug: true } } } });
    if (!p?.verificationLevel) return { ok: false as const, error: "notAllowed" as const };
    await tx.provider.update({ where: { id: providerId }, data: { verificationLevelId: null, verifiedAt: null } });
    await audit(tx, { actorId: reviewerId, action: "verification.revoked", entityType: "Provider", entityId: providerId, metadata: { level: p.verificationLevel.slug, reason: reason.trim().slice(0, 500) } });
    return { ok: true as const };
  });
}

/** Signed 60-second URL for one document, logged. The caller must already be an authorised reviewer. */
export async function documentUrlForReviewer(reviewerId: string, documentId: string): Promise<string | null> {
  const doc = await prisma.verificationDocument.findUnique({ where: { id: documentId }, select: { id: true, storageKey: true, requestId: true } });
  if (!doc) return null;
  await audit(prisma, { actorId: reviewerId, action: "verification.document_viewed", entityType: "VerificationRequest", entityId: doc.requestId, metadata: { documentId: doc.id } });
  return signedPrivateUrl(doc.storageKey, 60);
}

// ─── Level configuration (super admin) ──────────────────────────────────────────────────────

export type LevelInput = {
  id?: string;
  slug: string;
  nameEn: string;
  nameSw: string;
  descriptionEn: string;
  descriptionSw: string;
  rank: number;
  requiredDocuments: DocumentType[];
  isActive: boolean;
};

export async function saveLevel(actorId: string, input: LevelInput): Promise<VResult<{ id: string }>> {
  try {
    const level = await prisma.$transaction(async (tx) => {
      const { id, ...data } = input;
      const saved = id ? await tx.verificationLevel.update({ where: { id }, data }) : await tx.verificationLevel.create({ data });
      await audit(tx, { actorId, action: "verification.level_saved", entityType: "VerificationLevel", entityId: saved.id, metadata: { slug: saved.slug, rank: saved.rank, isActive: saved.isActive } });
      return saved;
    });
    return { ok: true, id: level.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2002" || err.code === "P2025")) return { ok: false, error: "notAllowed" };
    throw err;
  }
}
