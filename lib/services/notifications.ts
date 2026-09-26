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
  | "REQUEST_CANCELLED_BY_ADMIN" // customer: NEXA closed your request (Phase 12)
  | "ANNOUNCEMENT"; // everyone: a message from NEXA (Phase 12)

export type NotificationData = { requestId?: string; matchId?: string; providerName?: string; announcementId?: string };

type Db = Prisma.TransactionClient | typeof prisma;

export async function notify(db: Db, userIds: string[], type: NotificationType, data: NotificationData): Promise<void> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await db.notification.createMany({ data: unique.map((userId) => ({ userId, type, data })) });
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
