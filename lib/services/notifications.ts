import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// In-app notifications (Phase 7). A notification stores a type and ids only; the text is written
// in the reader's language when displayed, and links are rebuilt from the ids — so nothing
// private (message text, phone numbers) is copied into this table.

export type NotificationType =
  | "REQUEST_NEW" // provider: a matching request arrived
  | "REQUEST_INTEREST" // customer: a provider is interested
  | "QUOTE_NEW" // customer: a provider sent/updated a quote
  | "MESSAGE_NEW" // either side: new message in a conversation
  | "QUOTE_ACCEPTED" // provider: the customer chose you
  | "REQUEST_NOT_SELECTED" // provider: the customer chose someone else
  | "REQUEST_CANCELLED" // provider: the customer cancelled
  | "REQUEST_COMPLETED" // provider: the customer marked the job done
  | "REQUEST_CANCELLED_BY_ADMIN" // customer: GO BIG closed your request (Phase 12)
  | "REQUEST_REMINDER" // provider: a matching request is still waiting for your answer (automation)
  // Automation Engine, Phase C (customer follow-ups)
  | "REQUEST_NO_RESPONSE" // customer: no business has answered yet
  | "REQUEST_CHOOSE_REMINDER" // customer: quotes are waiting for your choice
  | "REQUEST_DONE_CHECK" // customer: was the job done?
  | "REVIEW_INVITE" // customer: rate the business you chose
  // Phase D: bookings (linked to the request) and business nudges (fixed pages)
  | "BOOKING_PROPOSED" // the other side proposed a time
  | "BOOKING_CONFIRMED" // the other side confirmed the time
  | "BOOKING_CANCELLED" // the other side cancelled the booking
  | "BOOKING_REMINDER" // both: the booking is coming up
  | "BOOKING_AT_RISK" // customer: the business went away around your booking
  | "REVIEW_REPLY_REMINDER" // provider: reviews waiting for your reply
  | "PROFILE_INCOMPLETE" // provider: finish your profile to appear in search
  | "PROVIDER_INACTIVE" // provider: customers asked while you were away
  | "ANNOUNCEMENT" // everyone: a message from GO BIG (Phase 12)
  // Phase 17: rides & deliveries
  | "TRIP_OFFER" // driver: a nearby trip is offered to you
  | "TRIP_ACCEPTED" // customer: a driver accepted
  | "TRIP_ARRIVED" // customer: the driver is at the pickup
  | "TRIP_STARTED" // customer: on the way / picked up
  | "TRIP_COMPLETED" // customer: done — rate the driver
  | "TRIP_CANCELLED" // the other side cancelled
  | "TRIP_EXPIRED"; // customer: no driver accepted in time

export type NotificationData = { requestId?: string; matchId?: string; providerName?: string; announcementId?: string; tripId?: string };

type Db = Prisma.TransactionClient | typeof prisma;

export async function notify(db: Db, userIds: string[], type: NotificationType, data: NotificationData): Promise<void> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  const created = await db.notification.createManyAndReturn({ data: unique.map((userId) => ({ userId, type, data })), select: { id: true } });
  // Automation Engine, Phase C: each notification may also go out by push/email. The delivery job
  // is queued in the same transaction, so it exists exactly when the notification does.
  await db.job.createMany({ data: created.map((n) => ({ type: "notify:deliver", payload: { notificationId: n.id }, maxAttempts: 4 })) });
}

/** Everyone who acts for a provider (owner + staff). */
export async function providerUserIds(db: Db, providerId: string): Promise<string[]> {
  return (await db.providerMember.findMany({ where: { providerId }, select: { userId: true } })).map((m) => m.userId);
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, take = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, type: true, data: true, readAt: true, createdAt: true },
  });
}

/** Marks the caller's own notifications read (all, or just the given ids). */
export async function markRead(userId: string, ids?: string[]): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
