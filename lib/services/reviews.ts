import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/services/audit";

// Ratings & reviews (Phase 5). Who may review whom is decided HERE, server-side:
//  • only CUSTOMER accounts review (providers can't review competitors; admins moderate instead),
//  • never a business you are a member of (no self-reviews),
//  • one review per customer per provider (DB unique) — editing replaces it,
//  • only live providers can be reviewed.
// Ratings on Provider are recomputed inside the same transaction as every change.

export type ReviewError = "notAllowed" | "providerUnavailable" | "ownBusiness" | "reviewNotFound" | "alreadyReported" | "cannotReportOwn";
export type RResult<T = object> = ({ ok: true } & T) | { ok: false; error: ReviewError };

type Tx = Prisma.TransactionClient;

/** Recomputes count/average from PUBLISHED reviews only. */
export async function refreshRating(tx: Tx, providerId: string): Promise<void> {
  const agg = await tx.review.aggregate({ where: { providerId, status: "PUBLISHED" }, _count: { _all: true }, _avg: { rating: true } });
  await tx.provider.update({
    where: { id: providerId },
    data: {
      ratingCount: agg._count._all,
      ratingAvg: agg._avg.rating == null ? null : Math.round(agg._avg.rating * 100) / 100,
    },
  });
}

async function isMember(userId: string, providerId: string): Promise<boolean> {
  return (await prisma.providerMember.count({ where: { userId, providerId } })) > 0;
}

export async function reviewEligibility(
  user: { id: string; role: string; status: string } | null,
  providerId: string,
): Promise<{ allowed: true } | { allowed: false; reason: "login" | "role" | "ownBusiness" | "providerUnavailable" }> {
  if (!user || user.status !== "ACTIVE") return { allowed: false, reason: "login" };
  if (user.role !== "CUSTOMER") return { allowed: false, reason: "role" };
  const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: { status: true, deletedAt: true } });
  if (!provider || provider.status !== "ACTIVE" || provider.deletedAt) return { allowed: false, reason: "providerUnavailable" };
  if (await isMember(user.id, providerId)) return { allowed: false, reason: "ownBusiness" };
  return { allowed: true };
}

export async function upsertReview(
  user: { id: string; role: string; status: string },
  providerId: string,
  input: { rating: number; body: string },
): Promise<RResult<{ reviewId: string }>> {
  const eligible = await reviewEligibility(user, providerId);
  if (!eligible.allowed) {
    return { ok: false, error: eligible.reason === "ownBusiness" ? "ownBusiness" : eligible.reason === "providerUnavailable" ? "providerUnavailable" : "notAllowed" };
  }
  const review = await prisma.$transaction(async (tx) => {
    // "Verified job" is decided here from a COMPLETED request this provider was accepted for —
    // never from the form (SEC-024). Re-checked on every edit.
    const verifiedJob =
      (await tx.serviceRequest.count({ where: { customerId: user.id, acceptedProviderId: providerId, status: "COMPLETED" } })) > 0;
    const existing = await tx.review.findUnique({ where: { providerId_authorId: { providerId, authorId: user.id } }, select: { id: true, status: true } });
    const saved = existing
      ? // Editing keeps a moderator's HIDDEN decision: a hidden review can't be un-hidden by editing it.
        await tx.review.update({ where: { id: existing.id }, data: { rating: input.rating, body: input.body, verifiedJob, editedAt: new Date() } })
      : await tx.review.create({ data: { providerId, authorId: user.id, rating: input.rating, body: input.body, verifiedJob } });
    await refreshRating(tx, providerId);
    return saved;
  });
  return { ok: true, reviewId: review.id };
}

export async function deleteOwnReview(userId: string, reviewId: string): Promise<RResult> {
  return prisma.$transaction(async (tx) => {
    const r = await tx.review.findFirst({ where: { id: reviewId, authorId: userId }, select: { id: true, providerId: true } });
    if (!r) return { ok: false as const, error: "reviewNotFound" as const };
    await tx.review.delete({ where: { id: r.id } });
    await refreshRating(tx, r.providerId);
    return { ok: true as const };
  });
}

/** Provider reply. Only an OWNER of the reviewed provider; the review itself is never touched. */
export async function respond(userId: string, reviewId: string, body: string): Promise<RResult> {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, status: "PUBLISHED", provider: { members: { some: { userId, role: "OWNER" } } } },
    select: { id: true },
  });
  if (!review) return { ok: false, error: "reviewNotFound" };
  await prisma.reviewResponse.upsert({
    where: { reviewId },
    create: { reviewId, authorId: userId, body },
    update: { body, authorId: userId },
  });
  return { ok: true };
}

export async function deleteResponse(userId: string, reviewId: string): Promise<RResult> {
  const r = await prisma.reviewResponse.deleteMany({ where: { reviewId, review: { provider: { members: { some: { userId, role: "OWNER" } } } } } });
  return r.count === 1 ? { ok: true } : { ok: false, error: "reviewNotFound" };
}

export async function reportReview(
  userId: string,
  reviewId: string,
  reason: "SPAM" | "FAKE" | "OFFENSIVE" | "CONFLICT_OF_INTEREST" | "OTHER",
  note: string | null,
): Promise<RResult> {
  const review = await prisma.review.findFirst({ where: { id: reviewId, status: "PUBLISHED" }, select: { authorId: true } });
  if (!review) return { ok: false, error: "reviewNotFound" };
  if (review.authorId === userId) return { ok: false, error: "cannotReportOwn" };
  try {
    await prisma.reviewReport.create({ data: { reviewId, reporterId: userId, reason, note } });
    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: "alreadyReported" };
    throw err;
  }
}

// ─── Public read ────────────────────────────────────────────────────────────────────────────

/** Reviewer names are shown as "Asha J." — never full names, contact details or ids. */
export function publicReviewerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const first = parts[0]!;
  const initial = parts.length > 1 ? ` ${parts[parts.length - 1]![0]!.toUpperCase()}.` : "";
  return `${first}${initial}`;
}

export const REVIEWS_PAGE_SIZE = 10;

export async function publicReviews(providerId: string, page = 1) {
  const where = { providerId, status: "PUBLISHED" as const };
  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * REVIEWS_PAGE_SIZE,
      take: REVIEWS_PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        editedAt: true,
        verifiedJob: true,
        author: { select: { name: true } },
        response: { select: { body: true, createdAt: true, updatedAt: true } },
      },
    }),
  ]);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE)),
    reviews: rows.map(({ author, ...r }) => ({ ...r, authorName: publicReviewerName(author.name) })),
  };
}

export async function ownReview(userId: string, providerId: string) {
  return prisma.review.findUnique({
    where: { providerId_authorId: { providerId, authorId: userId } },
    select: { id: true, rating: true, body: true, status: true },
  });
}

/** Reviews on the provider's own business, for their dashboard (hidden ones included, labelled). */
export async function providerInbox(providerId: string) {
  const rows = await prisma.review.findMany({
    where: { providerId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      rating: true,
      body: true,
      status: true,
      createdAt: true,
      author: { select: { name: true } },
      response: { select: { body: true } },
    },
  });
  return rows.map(({ author, ...r }) => ({ ...r, authorName: publicReviewerName(author.name) }));
}

// ─── Moderation (admin) ─────────────────────────────────────────────────────────────────────

export async function moderationQueue() {
  return prisma.review.findMany({
    where: { reports: { some: { status: "OPEN" } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      rating: true,
      body: true,
      status: true,
      createdAt: true,
      author: { select: { name: true, email: true, phone: true } },
      provider: { select: { slug: true, profile: { select: { displayName: true } } } },
      response: { select: { body: true } },
      reports: { where: { status: "OPEN" }, select: { id: true, reason: true, note: true, createdAt: true, reporter: { select: { name: true, role: true } } } },
    },
  });
}

export type Moderation = "HIDE" | "RESTORE" | "DISMISS";

export async function moderate(adminId: string, reviewId: string, action: Moderation, note: string | null): Promise<RResult> {
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.findUnique({ where: { id: reviewId }, select: { id: true, providerId: true, status: true } });
    if (!review) return { ok: false as const, error: "reviewNotFound" as const };
    const now = new Date();
    if (action === "HIDE") {
      await tx.review.update({ where: { id: reviewId }, data: { status: "HIDDEN" } });
      await tx.reviewReport.updateMany({ where: { reviewId, status: "OPEN" }, data: { status: "ACTIONED", resolvedById: adminId, resolvedAt: now } });
    } else if (action === "RESTORE") {
      await tx.review.update({ where: { id: reviewId }, data: { status: "PUBLISHED" } });
    } else {
      await tx.reviewReport.updateMany({ where: { reviewId, status: "OPEN" }, data: { status: "DISMISSED", resolvedById: adminId, resolvedAt: now } });
    }
    await refreshRating(tx, review.providerId);
    const auditAction = action === "HIDE" ? "review.hidden" : action === "RESTORE" ? "review.restored" : "review.reports_dismissed";
    await audit(tx, { actorId: adminId, action: auditAction, entityType: "Review", entityId: reviewId, metadata: { providerId: review.providerId, note: note?.slice(0, 500) ?? null } });
    return { ok: true as const };
  });
}
