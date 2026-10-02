import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { delKey, incrWindow } from "@/lib/kv";

// Fixed-window rate limiting (SEC-010): Redis when REDIS_URL is set (Phase 16), else Postgres. One atomic upsert per check, so concurrent
// requests can't slip past the limit. Keys are hashed: no emails, phones or IPs are stored.

export type Limit = { name: string; max: number; windowSec: number };

/** Limits chosen per purpose (see SECURITY_BACKLOG SEC-010). */
function aiDailyCap(): number {
  const raw = process.env.AI_DAILY_CALL_CAP?.trim();
  const n = raw ? Number(raw) : 2000; // blank means the default, not 0
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2000;
}

export const LIMITS = {
  loginPerIdentifier: { name: "login:id", max: 10, windowSec: 15 * 60 },
  loginPerIp: { name: "login:ip", max: 50, windowSec: 15 * 60 },
  signupPerIp: { name: "signup:ip", max: 10, windowSec: 60 * 60 },
  resetPerIp: { name: "reset:ip", max: 10, windowSec: 60 * 60 },
  // Phase 13 (SEC-008): opening/using reset links. Tokens are unguessable; this just caps probing.
  resetUsePerIp: { name: "resetuse:ip", max: 30, windowSec: 60 * 60 },
  reviewPerUser: { name: "review:user", max: 10, windowSec: 24 * 60 * 60 },
  reportPerUser: { name: "report:user", max: 30, windowSec: 24 * 60 * 60 },
  responsePerUser: { name: "response:user", max: 60, windowSec: 24 * 60 * 60 },
  uploadPerProvider: { name: "upload:provider", max: 60, windowSec: 60 * 60 },
  verificationDocPerProvider: { name: "vdoc:provider", max: 40, windowSec: 60 * 60 },
  // Contact taps are already de-duplicated per person/day; this just stops scripted floods.
  connectPerVisitor: { name: "connect:visitor", max: 120, windowSec: 60 * 60 },
  // Phase 7. Open requests are also capped at MAX_OPEN_REQUESTS in the service.
  requestPerUser: { name: "request:user", max: 10, windowSec: 24 * 60 * 60 },
  requestPhotoPerUser: { name: "rphoto:user", max: 40, windowSec: 60 * 60 },
  messagePerUser: { name: "message:user", max: 120, windowSec: 60 * 60 },
  quotePerProvider: { name: "quote:provider", max: 100, windowSec: 60 * 60 },
  // Phase 9: each AI search may cost a model call. Over the limit the rule-based parser answers
  // instead, so search keeps working and nothing is charged.
  aiSearchPerVisitor: { name: "ai:visitor", max: 30, windowSec: 60 * 60 },
  aiSearchPerIp: { name: "ai:ip", max: 120, windowSec: 60 * 60 },
  // Phase 13 (SEC-036): a platform-wide ceiling on model calls per day, whatever the number of
  // visitors or addresses. Set AI_DAILY_CALL_CAP to change it; 0 turns model calls off.
  aiGlobalDaily: { name: "ai:global", max: aiDailyCap(), windowSec: 24 * 60 * 60 },
  // Phase 10: saving/unsaving providers.
  favoritePerUser: { name: "fav:user", max: 120, windowSec: 60 * 60 },
  // Phase 17: rides & deliveries. Active trips are also capped at MAX_ACTIVE_TRIPS in the service.
  tripPerUser: { name: "trip:user", max: 20, windowSec: 24 * 60 * 60 },
  // Guessing a 4-digit PIN/handover code: 10 tries per trip per hour.
  tripCodePerTrip: { name: "tripcode:trip", max: 10, windowSec: 60 * 60 },
  // One position every ~5 s while online, with headroom.
  driverLocationPerProvider: { name: "driverloc:provider", max: 1000, windowSec: 60 * 60 },
  // Status polling from open trip screens (every ~5 s).
  tripPollPerUser: { name: "trippoll:user", max: 1500, windowSec: 60 * 60 },
  // Automation Engine, Phase C: push subscribe/unsubscribe and preference saves.
  pushSubscribePerUser: { name: "pushsub:user", max: 30, windowSec: 60 * 60 },
  notificationPrefsPerUser: { name: "nprefs:user", max: 60, windowSec: 60 * 60 },
  // Phase E: "Help me write" on the request form (each may cost a model call).
  aiAssistPerUser: { name: "aiassist:user", max: 20, windowSec: 24 * 60 * 60 },
  // Settings page: password checks (change password, delete account) and profile edits.
  accountPasswordPerUser: { name: "acctpw:user", max: 5, windowSec: 15 * 60 },
  accountEditPerUser: { name: "acctedit:user", max: 20, windowSec: 60 * 60 },
} satisfies Record<string, Limit>;

export type LimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSec: number };

function keyFor(limit: Limit, subject: string): string {
  return `${limit.name}:${createHash("sha256").update(subject.toLowerCase()).digest("hex").slice(0, 32)}`;
}

/** Counts one attempt against `limit` for `subject` and says whether it's allowed. */
export async function hit(limit: Limit, subject: string): Promise<LimitResult> {
  const key = keyFor(limit, subject);
  // Phase 16: Redis when configured (shared by every instance, no database write per check);
  // Postgres when it isn't or doesn't answer.
  const fast = await incrWindow(key, limit.windowSec);
  if (fast) {
    return fast.count > limit.max ? { ok: false, retryAfterSec: Math.max(1, fast.ttlSec) } : { ok: true, remaining: limit.max - fast.count };
  }
  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" <= now() - make_interval(secs => ${limit.windowSec}) THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" <= now() - make_interval(secs => ${limit.windowSec}) THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart"`;
  const row = rows[0]!;

  // Occasionally sweep long-expired windows so the table stays small.
  if (Math.random() < 0.01) {
    void prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '2 days'`.catch(() => undefined);
  }

  if (row.count > limit.max) {
    const resetAt = row.windowStart.getTime() + limit.windowSec * 1000;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) };
  }
  return { ok: true, remaining: limit.max - row.count };
}

/** Clears a subject's counter (e.g. after a successful login). */
export async function reset(limit: Limit, subject: string): Promise<void> {
  const key = keyFor(limit, subject);
  await Promise.all([delKey(key), prisma.rateLimit.deleteMany({ where: { key } })]);
}
