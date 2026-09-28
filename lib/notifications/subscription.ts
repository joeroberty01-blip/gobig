import { z } from "zod";
import { prisma } from "@/lib/db";

// Automation Engine, Phase C: saving a browser's push subscription.
//
// SEC-056: the server later POSTs to the subscription's endpoint. Accepting any URL would let a
// user point our server at internal addresses (SSRF), so only the real push services are allowed.

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export const MAX_SUBSCRIPTIONS_PER_USER = 10;

export function allowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.port && !u.username && !u.password && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

const b64url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/);
export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine(allowedPushEndpoint),
  keys: z.object({ p256dh: b64url.min(40).max(200), auth: b64url.min(8).max(64) }),
});

export async function saveSubscription(userId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: "invalid" }> {
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { endpoint, keys } = parsed.data;
  // One device, one owner: a phone that signs into another account moves with it.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
  });
  // Keep the newest few per person.
  const extra = await prisma.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip: MAX_SUBSCRIPTIONS_PER_USER, select: { id: true } });
  if (extra.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  return { ok: true };
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint: String(endpoint).slice(0, 1000) } });
}
