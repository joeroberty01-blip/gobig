"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import * as requests from "@/lib/services/requests";
import { markRead } from "@/lib/services/notifications";
import * as v from "@/lib/validators/requests";

// Phase 7 server actions: authenticate → can() → validate → rate limit → service (which checks
// that the caller owns the request or was matched to it). Customer/provider ids come from the session.

type ErrorKey = keyof Dictionary["errors"];
export type RequestActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorKey; field?: string };

function invalid(error: z.ZodError): { ok: false; error: ErrorKey; field?: string } {
  const issue = error.issues[0];
  return { ok: false, error: (issue?.message as ErrorKey) ?? "generic", field: issue?.path.map(String).join(".") };
}

const fail = (error: string) => ({ ok: false as const, error: error as ErrorKey });

function refresh() {
  revalidatePath("/requests", "layout");
  revalidatePath("/provider/requests", "layout");
  revalidatePath("/notifications");
  revalidatePath("/provider/notifications");
}

// ─── Customer ───────────────────────────────────────────────────────────────────────────────

export async function createRequestAction(input: z.input<typeof v.requestSchema>): Promise<RequestActionResult<{ requestId: string }>> {
  const user = await getCurrentUser();
  if (!can(user, "requests:create")) return fail("forbidden");
  const parsed = v.requestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await hit(LIMITS.requestPerUser, user!.id)).ok) return fail("rateLimited");
  const r = await requests.createRequest(user!, parsed.data);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true, requestId: r.requestId };
}

export async function acceptProviderAction(input: z.input<typeof v.acceptSchema>): Promise<RequestActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "requests:create")) return fail("forbidden");
  const parsed = v.acceptSchema.safeParse(input);
  if (!parsed.success) return fail("generic");
  const r = await requests.acceptProvider(user!.id, parsed.data.requestId, parsed.data.providerId);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function cancelRequestAction(requestId: string): Promise<RequestActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "requests:create")) return fail("forbidden");
  const parsed = v.requestIdSchema.safeParse({ requestId });
  if (!parsed.success) return fail("generic");
  const r = await requests.cancelRequest(user!.id, parsed.data.requestId);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function completeRequestAction(requestId: string): Promise<RequestActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "requests:create")) return fail("forbidden");
  const parsed = v.requestIdSchema.safeParse({ requestId });
  if (!parsed.success) return fail("generic");
  const r = await requests.completeRequest(user!.id, parsed.data.requestId);
  if (!r.ok) return fail(r.error);
  refresh();
  revalidatePath("/p/[slug]", "page");
  return { ok: true };
}

// ─── Provider ───────────────────────────────────────────────────────────────────────────────

async function ownProvider() {
  const user = await getCurrentUser();
  if (!can(user, "requests:respond")) return null;
  const providerId = await getOwnedProviderId(user!.id);
  return providerId ? { user: user!, providerId } : null;
}

export async function interestAction(requestId: string): Promise<RequestActionResult> {
  const owner = await ownProvider();
  if (!owner) return fail("forbidden");
  const parsed = v.requestIdSchema.safeParse({ requestId });
  if (!parsed.success) return fail("generic");
  const r = await requests.expressInterest(owner.providerId, parsed.data.requestId);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function declineAction(requestId: string): Promise<RequestActionResult> {
  const owner = await ownProvider();
  if (!owner) return fail("forbidden");
  const parsed = v.requestIdSchema.safeParse({ requestId });
  if (!parsed.success) return fail("generic");
  const r = await requests.declineRequest(owner.providerId, parsed.data.requestId);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function sendQuoteAction(input: z.input<typeof v.quoteSchema>): Promise<RequestActionResult> {
  const owner = await ownProvider();
  if (!owner) return fail("forbidden");
  const parsed = v.quoteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await hit(LIMITS.quotePerProvider, owner.providerId)).ok) return fail("rateLimited");
  const { requestId, ...quote } = parsed.data;
  const r = await requests.sendQuote(owner.providerId, requestId, quote);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function withdrawQuoteAction(requestId: string): Promise<RequestActionResult> {
  const owner = await ownProvider();
  if (!owner) return fail("forbidden");
  const parsed = v.requestIdSchema.safeParse({ requestId });
  if (!parsed.success) return fail("generic");
  const r = await requests.withdrawQuote(owner.providerId, parsed.data.requestId);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

// ─── Both sides ─────────────────────────────────────────────────────────────────────────────

export async function sendMessageAction(input: z.input<typeof v.messageSchema>): Promise<RequestActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "requests:create") && !can(user, "requests:respond")) return fail("forbidden");
  const parsed = v.messageSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await hit(LIMITS.messagePerUser, user!.id)).ok) return fail("rateLimited");
  const r = await requests.sendMessage(user!.id, parsed.data.matchId, parsed.data.body);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function markRequestSeenAction(requestId: string): Promise<void> {
  const user = await getCurrentUser();
  if ((!can(user, "requests:create") && !can(user, "requests:respond")) || typeof requestId !== "string" || requestId.length > 40) return;
  await requests.markRequestSeen(user!.id, requestId);
  revalidatePath("/", "layout"); // the header bell count
}

export async function markNotificationsReadAction(ids?: string[]): Promise<void> {
  const user = await getCurrentUser();
  if (!can(user, "notifications:view")) return;
  const safe = Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && x.length <= 40).slice(0, 100) : undefined;
  await markRead(user!.id, safe);
  revalidatePath("/", "layout");
}
