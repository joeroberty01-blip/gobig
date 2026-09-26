"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import * as reviews from "@/lib/services/reviews";
import * as verification from "@/lib/services/verification";
import * as v from "@/lib/validators/trust";
import { invalidate } from "@/lib/cache";
import type { DocumentType } from "@/lib/services/verification";

// Phase 5 server actions: authenticate → can() → validate → rate limit (where abusable) →
// service (which checks ownership). Ids of providers/users always come from the session.

type ErrorKey = keyof Dictionary["errors"];
export type TrustResult = { ok: true } | { ok: false; error: ErrorKey; field?: string };

function invalid(error: z.ZodError): TrustResult {
  const issue = error.issues[0];
  return { ok: false, error: (issue?.message as ErrorKey) ?? "generic", field: issue?.path.map(String).join(".") };
}

function fail(error: string): TrustResult {
  return { ok: false, error: error as ErrorKey };
}

async function refreshProviderPages() {
  revalidatePath("/p/[slug]", "page");
  revalidatePath("/provider", "layout");
  revalidatePath("/admin", "layout");
}

// ─── Customer: reviews ──────────────────────────────────────────────────────────────────────

export async function saveReviewAction(input: z.input<typeof v.reviewSchema>): Promise<TrustResult> {
  const user = await getCurrentUser();
  if (!can(user, "review:write")) return fail("forbidden");
  const parsed = v.reviewSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await hit(LIMITS.reviewPerUser, user!.id)).ok) return fail("rateLimited");
  const r = await reviews.upsertReview(user!, parsed.data.providerId, { rating: parsed.data.rating, body: parsed.data.body });
  if (!r.ok) return fail(r.error);
  await refreshProviderPages();
  return { ok: true };
}

export async function deleteReviewAction(reviewId: string): Promise<TrustResult> {
  const user = await getCurrentUser();
  if (!can(user, "review:write") || typeof reviewId !== "string") return fail("forbidden");
  const r = await reviews.deleteOwnReview(user!.id, reviewId);
  if (!r.ok) return fail(r.error);
  await refreshProviderPages();
  return { ok: true };
}

export async function reportReviewAction(input: z.input<typeof v.reportSchema>): Promise<TrustResult> {
  const user = await getCurrentUser();
  if (!can(user, "review:report")) return fail("forbidden");
  const parsed = v.reportSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await hit(LIMITS.reportPerUser, user!.id)).ok) return fail("rateLimited");
  const r = await reviews.reportReview(user!.id, parsed.data.reviewId, parsed.data.reason, parsed.data.note);
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// ─── Provider: replies ──────────────────────────────────────────────────────────────────────

export async function respondAction(input: z.input<typeof v.responseSchema>): Promise<TrustResult> {
  const user = await getCurrentUser();
  if (!can(user, "review:respond")) return fail("forbidden");
  const parsed = v.responseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await hit(LIMITS.responsePerUser, user!.id)).ok) return fail("rateLimited");
  const r = await reviews.respond(user!.id, parsed.data.reviewId, parsed.data.body);
  if (!r.ok) return fail(r.error);
  await refreshProviderPages();
  return { ok: true };
}

export async function deleteResponseAction(reviewId: string): Promise<TrustResult> {
  const user = await getCurrentUser();
  if (!can(user, "review:respond") || typeof reviewId !== "string") return fail("forbidden");
  const r = await reviews.deleteResponse(user!.id, reviewId);
  if (!r.ok) return fail(r.error);
  await refreshProviderPages();
  return { ok: true };
}

// ─── Provider: verification ─────────────────────────────────────────────────────────────────

async function ownProvider() {
  const user = await getCurrentUser();
  if (!can(user, "verification:request")) return null;
  const providerId = await getOwnedProviderId(user!.id);
  return providerId ? { user: user!, providerId } : null;
}

export async function startVerificationAction(input: z.input<typeof v.startVerificationSchema>): Promise<TrustResult> {
  const owner = await ownProvider();
  if (!owner) return fail("forbidden");
  const parsed = v.startVerificationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await verification.startRequest(owner.providerId, parsed.data.levelId);
  if (!r.ok) return fail(r.error);
  revalidatePath("/provider/verification");
  return { ok: true };
}

export async function submitVerificationAction(input: z.input<typeof v.submitVerificationSchema>): Promise<TrustResult> {
  const owner = await ownProvider();
  if (!owner) return fail("forbidden");
  const parsed = v.submitVerificationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await verification.submitRequest(owner.providerId, parsed.data.requestId, parsed.data.note, owner.user.id);
  if (!r.ok) return fail(r.error);
  revalidatePath("/provider/verification");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function cancelVerificationAction(requestId: string): Promise<TrustResult> {
  const owner = await ownProvider();
  if (!owner || typeof requestId !== "string") return fail("forbidden");
  const r = await verification.cancelRequest(owner.providerId, requestId, owner.user.id);
  if (!r.ok) return fail(r.error);
  revalidatePath("/provider/verification");
  return { ok: true };
}

export async function removeVerificationDocAction(documentId: string): Promise<TrustResult> {
  const owner = await ownProvider();
  if (!owner || typeof documentId !== "string") return fail("forbidden");
  const r = await verification.removeDocument(owner.providerId, documentId);
  if (!r.ok) return fail(r.error);
  revalidatePath("/provider/verification");
  return { ok: true };
}

// ─── Admin: verification decisions & configuration ──────────────────────────────────────────

export async function decideVerificationAction(input: z.input<typeof v.decisionSchema>): Promise<TrustResult> {
  const user = await getCurrentUser();
  if (!can(user, "verification:review")) return fail("forbidden");
  const parsed = v.decisionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await verification.decide(user!.id, parsed.data.requestId, parsed.data.decision, parsed.data.note);
  if (!r.ok) return fail(r.error);
  await refreshProviderPages();
  return { ok: true };
}

export async function revokeVerificationAction(input: z.input<typeof v.revokeSchema>): Promise<TrustResult> {
  const user = await getCurrentUser();
  if (!can(user, "verification:review")) return fail("forbidden");
  const parsed = v.revokeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await verification.revoke(user!.id, parsed.data.providerId, parsed.data.reason);
  if (!r.ok) return fail(r.error);
  await refreshProviderPages();
  return { ok: true };
}

export async function saveLevelAction(input: z.input<typeof v.levelSchema>): Promise<TrustResult> {
  const user = await getCurrentUser();
  if (!can(user, "verification:configure")) return fail("forbidden");
  const parsed = v.levelSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await verification.saveLevel(user!.id, { ...parsed.data, requiredDocuments: parsed.data.requiredDocuments as DocumentType[] });
  if (!r.ok) return fail(r.error);
  invalidate("ref:");
  revalidatePath("/admin/verification", "layout");
  revalidatePath("/provider/verification");
  return { ok: true };
}

// ─── Admin: review moderation ───────────────────────────────────────────────────────────────

export async function moderateReviewAction(input: z.input<typeof v.moderationSchema>): Promise<TrustResult> {
  const user = await getCurrentUser();
  if (!can(user, "reviews:moderate")) return fail("forbidden");
  const parsed = v.moderationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await reviews.moderate(user!.id, parsed.data.reviewId, parsed.data.action, parsed.data.note);
  if (!r.ok) return fail(r.error);
  await refreshProviderPages();
  return { ok: true };
}
