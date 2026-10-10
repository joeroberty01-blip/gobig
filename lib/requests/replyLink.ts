import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// One-tap reply links (product plan, 2026-10-10). A new request reaches a business by SMS with a
// link it can open on any phone without signing in. The link is signed with the server secret and
// carries only: which conversation (match), which member of the business, and when it expires. It
// lets that member answer that one request — interest, a message, a price, or "not available" —
// and nothing else (SEC-067). Nothing is stored; a changed secret invalidates every link.

const TTL_MS = 7 * 24 * 60 * 60_000;

function secret(): string {
  const s = process.env.REPLY_LINK_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`reply-link:${payload}`).digest("base64url").slice(0, 32);

export function createReplyToken(matchId: string, userId: string, now = new Date()): string {
  const exp = Math.floor((now.getTime() + TTL_MS) / 1000).toString(36);
  const payload = `${matchId}.${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export type ReplyClaim = { matchId: string; userId: string };

/** The claim if the token is genuine and not expired, else null. Constant-time signature check. */
export function verifyReplyToken(token: string, now = new Date()): ReplyClaim | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [matchId, userId, exp, sig] = parts as [string, string, string, string];
  if (!/^[a-z0-9]{10,40}$/.test(matchId) || !/^[a-z0-9]{10,40}$/.test(userId) || !/^[a-z0-9]{1,10}$/.test(exp)) return null;
  const expected = Buffer.from(sign(`${matchId}.${userId}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (parseInt(exp, 36) * 1000 < now.getTime()) return null;
  return { matchId, userId };
}
