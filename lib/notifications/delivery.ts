import { prisma } from "@/lib/db";
import type { NotificationChannel } from "@/generated/prisma/client";
import { enqueue } from "@/lib/jobs/queue";
import { appUrl, sendEmail, smtpConfigured } from "@/lib/services/notify";
import type { NotificationType } from "@/lib/services/notifications";
import { DAILY_CAP, darDayStart, getPreferences, quietUntil, TYPE_CATEGORY, URGENT } from "./preferences";
import { pushConfigured, sendPush } from "./push";
import { renderNotification } from "./render";

// Automation Engine, Phase C: delivering one in-app notification by push and email.
// Called by the "notify:deliver" job that notify() queues in the same transaction as the
// notification. Each channel's outcome is recorded once in NotificationDelivery (unique per
// notification + channel), so a retried job never sends twice.

export const DELIVER_JOB = "notify:deliver";
const CHANNELS: NotificationChannel[] = ["PUSH", "EMAIL"];

type Outcome = { status: "SENT" | "SKIPPED"; reason?: string } | { status: "LATER"; until: Date };

export async function deliverNotification(notificationId: string, now = new Date()): Promise<void> {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, type: true, data: true, readAt: true, user: { select: { id: true, role: true, status: true, locale: true, email: true, deletedAt: true } } },
  });
  if (!n) return;
  const user = n.user;
  const type = n.type as NotificationType;
  const existing = await prisma.notificationDelivery.findMany({ where: { notificationId } });
  const pending = CHANNELS.filter((c) => !existing.some((d) => d.channel === c && (d.status === "SENT" || d.status === "SKIPPED")));
  if (!pending.length) return;

  const skipAll = user.status !== "ACTIVE" || user.deletedAt ? "inactiveAccount" : n.readAt ? "alreadyRead" : null;
  const prefs = await getPreferences(user.id);
  const category = TYPE_CATEGORY[type];
  const urgent = URGENT.has(type);
  const rendered = skipAll ? null : await renderNotification(n, { role: user.role, locale: user.locale });

  let later = null as Date | null;
  for (const channel of pending) {
    const outcome: Outcome = await (async (): Promise<Outcome> => {
      if (skipAll) return { status: "SKIPPED", reason: skipAll };
      if (!category) return { status: "SKIPPED", reason: "unknownType" };
      if (!prefs.categories[category][channel === "PUSH" ? "push" : "email"]) return { status: "SKIPPED", reason: "preference" };
      if (!rendered) return { status: "SKIPPED", reason: "nothingToShow" };
      if (!urgent) {
        const until = quietUntil(prefs, now);
        if (until) return { status: "LATER", until };
        const sentToday = await prisma.notificationDelivery.count({ where: { userId: user.id, channel, status: "SENT", sentAt: { gte: darDayStart(now) } } });
        if (sentToday >= DAILY_CAP[channel]) return { status: "SKIPPED", reason: "dailyCap" };
      }
      return channel === "PUSH" ? pushOnce(user.id, rendered, urgent, notificationId) : emailOnce(user.email, rendered);
    })();

    if (outcome.status === "LATER") {
      if (!later || outcome.until < later) later = outcome.until;
      await record(notificationId, user.id, channel, "QUEUED", "quietHours");
      continue;
    }
    await record(notificationId, user.id, channel, outcome.status, outcome.reason, outcome.status === "SENT" ? now : undefined);
  }
  if (later) await enqueue(DELIVER_JOB, { notificationId }, { runAt: later, dedupeKey: `deliver-later:${notificationId}` });
}

async function record(notificationId: string, userId: string, channel: NotificationChannel, status: "QUEUED" | "SENT" | "SKIPPED" | "FAILED", reason?: string, sentAt?: Date) {
  await prisma.notificationDelivery.upsert({
    where: { notificationId_channel: { notificationId, channel } },
    create: { notificationId, userId, channel, status, reason: reason ?? null, attempts: 1, sentAt: sentAt ?? null },
    update: { status, reason: reason ?? null, attempts: { increment: 1 }, sentAt: sentAt ?? null },
  });
}

async function pushOnce(userId: string, r: { title: string; body: string; url: string }, urgent: boolean, tag: string): Promise<Outcome> {
  if (!pushConfigured()) return { status: "SKIPPED", reason: "pushNotConfigured" };
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return { status: "SKIPPED", reason: "noSubscription" };
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    const res = await sendPush(s, { ...r, tag }, urgent);
    if (res === "sent") {
      sent++;
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
    } else if (res === "gone") await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
    else failed++;
  }
  if (sent) return { status: "SENT" };
  // Every device failed for a reason other than "unsubscribed": let the queue retry.
  if (failed) throw new Error("push service unavailable");
  return { status: "SKIPPED", reason: "noSubscription" };
}

async function emailOnce(to: string | null, r: { title: string; body: string; url: string }): Promise<Outcome> {
  if (!to) return { status: "SKIPPED", reason: "noEmail" };
  if (!smtpConfigured()) return { status: "SKIPPED", reason: "emailNotConfigured" };
  await sendEmail(to, `${r.title} — ${r.body}`.slice(0, 120), `${r.body}\n\n${appUrl(r.url)}\n\n— Go Big`);
  return { status: "SENT" };
}
