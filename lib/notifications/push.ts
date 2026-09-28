import webpush from "web-push";

// Automation Engine, Phase C: Web Push (free; works in browsers and the Play Store web app).
// Needs VAPID keys: `npx web-push generate-vapid-keys`. VAPID_PUBLIC_KEY is public (the browser
// uses it to subscribe); VAPID_PRIVATE_KEY is a secret. Without them push is simply off.

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:support@nexa.co.tz", pub, priv);
    return (configured = true);
  } catch {
    return (configured = false);
  }
}

export function vapidPublicKey(): string | null {
  return pushConfigured() ? process.env.VAPID_PUBLIC_KEY!.trim() : null;
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushResult = "sent" | "gone" | "failed";

/** Sends one push. "gone" = the browser unsubscribed; the caller removes the subscription. */
export async function sendPush(target: PushTarget, payload: { title: string; body: string; url: string; tag?: string }, urgent = false): Promise<PushResult> {
  if (!pushConfigured()) return "failed";
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
      TTL: urgent ? 300 : 24 * 60 * 60,
      urgency: urgent ? "high" : "normal",
      timeout: 10_000,
    });
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}
