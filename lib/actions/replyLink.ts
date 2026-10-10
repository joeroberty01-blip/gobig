"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyReplyToken } from "@/lib/requests/replyLink";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { declineRequest, expressInterest, sendMessage, sendQuote } from "@/lib/services/requests";

// One-tap replies from the SMS link (SEC-067). Every call re-checks the signed token, that the
// member still belongs to the business and is active, and the same request rules the app uses
// (open request, lead allowance). The token never grants anything beyond this one conversation.

export type ReplyResult = { ok: true } | { ok: false; error: "invalid" | "closed" | "limit" | "rateLimited" | "error" };

async function context(token: unknown) {
  const claim = typeof token === "string" ? verifyReplyToken(token) : null;
  if (!claim) return null;
  if (!(await hit(LIMITS.replyLinkPerToken, claim.matchId + claim.userId)).ok) return "rateLimited" as const;
  const match = await prisma.requestMatch.findUnique({
    where: { id: claim.matchId },
    select: { id: true, requestId: true, providerId: true, provider: { select: { members: { where: { userId: claim.userId }, select: { user: { select: { status: true, deletedAt: true } } } } } } },
  });
  const member = match?.provider.members[0]?.user;
  if (!match || !member || member.status !== "ACTIVE" || member.deletedAt) return null;
  return { ...claim, requestId: match.requestId, providerId: match.providerId };
}

function mapError(error: string): ReplyResult {
  if (error === "leadLimitReached") return { ok: false, error: "limit" };
  if (error === "requestClosed" || error === "requestNotFound") return { ok: false, error: "closed" };
  return { ok: false, error: "error" };
}

export async function replyInterestedAction(token: string): Promise<ReplyResult> {
  const c = await context(token);
  if (c === "rateLimited") return { ok: false, error: "rateLimited" };
  if (!c) return { ok: false, error: "invalid" };
  const r = await expressInterest(c.providerId, c.requestId);
  return r.ok ? { ok: true } : mapError(r.error);
}

const messageSchema = z.string().trim().min(2).max(500);

export async function replyMessageAction(token: string, body: unknown): Promise<ReplyResult> {
  const c = await context(token);
  if (c === "rateLimited") return { ok: false, error: "rateLimited" };
  if (!c) return { ok: false, error: "invalid" };
  const text = messageSchema.safeParse(body);
  if (!text.success) return { ok: false, error: "error" };
  const r = await sendMessage(c.userId, c.matchId, text.data);
  return r.ok ? { ok: true } : mapError(r.error);
}

const quoteSchema = z.object({ amount: z.coerce.number().int().min(500).max(100_000_000), note: z.string().trim().max(300).optional() });

export async function replyQuoteAction(token: string, input: unknown): Promise<ReplyResult> {
  const c = await context(token);
  if (c === "rateLimited") return { ok: false, error: "rateLimited" };
  if (!c) return { ok: false, error: "invalid" };
  const q = quoteSchema.safeParse(input);
  if (!q.success) return { ok: false, error: "error" };
  const r = await sendQuote(c.providerId, c.requestId, { amount: q.data.amount, note: q.data.note || null, validUntil: null });
  return r.ok ? { ok: true } : mapError(r.error);
}

export async function replyDeclineAction(token: string): Promise<ReplyResult> {
  const c = await context(token);
  if (c === "rateLimited") return { ok: false, error: "rateLimited" };
  if (!c) return { ok: false, error: "invalid" };
  const r = await declineRequest(c.providerId, c.requestId);
  return r.ok ? { ok: true } : mapError(r.error);
}
