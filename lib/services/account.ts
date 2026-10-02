import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/services/auth";
import { audit } from "@/lib/services/audit";

// Settings page (owner, 2026-10-01): what a signed-in person can change about their own account.
// Every function takes the id from the session, never from the form.

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const DELETED_NAME = "Deleted user";

const ACTIVE_TRIP = ["REQUESTED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"] as const;

export async function updateName(userId: string, raw: string): Promise<{ ok: true } | { ok: false; error: "nameInvalid" }> {
  const name = raw.trim().replace(/\s+/g, " ");
  // Letters, spaces and common name punctuation; no links or contact details hidden in a name.
  // A dot between two letters ("example.com") is a web address, not an initial ("J. Mushi").
  if (name.length < NAME_MIN || name.length > NAME_MAX || !/^[\p{L}\p{M} .'-]+$/u.test(name) || /\S\.\S/u.test(name)) return { ok: false, error: "nameInvalid" };
  await prisma.user.update({ where: { id: userId }, data: { name } });
  return { ok: true };
}

async function passwordMatches(userId: string, password: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, deletedAt: true } });
  if (!u || u.deletedAt) return false;
  return bcrypt.compare(password, u.passwordHash);
}

/** New password; every session (this one too) stops working, so the person signs in again. */
export async function changePassword(userId: string, current: string, next: string): Promise<{ ok: true } | { ok: false; error: "wrongPassword" | "samePassword" }> {
  if (!(await passwordMatches(userId, current))) return { ok: false, error: "wrongPassword" };
  if (current === next) return { ok: false, error: "samePassword" };
  const passwordHash = await hashPassword(next);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } });
    await audit(tx, { actorId: userId, action: "account.password_changed", entityType: "User", entityId: userId });
  });
  return { ok: true };
}

/** Lost phone, shared computer: ends every session for this account, including this one. */
export async function signOutEverywhere(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordChangedAt: new Date() } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await audit(tx, { actorId: userId, action: "account.signed_out_everywhere", entityType: "User", entityId: userId });
  });
}

/**
 * The database requires an email or phone on every account (User_email_or_phone). A deleted account
 * keeps a placeholder under the reserved ".invalid" domain (RFC 2606): it can never receive mail and
 * frees the person's real address for a new account.
 */
export const deletedEmail = (userId: string) => `deleted-${userId}@deleted.invalid`;

export type DeleteError = "wrongPassword" | "notCustomer" | "activeTrip";

/**
 * Deletes a customer account (Play Store requirement). Personal details are removed at once: name,
 * email, phone, password and two-factor are wiped, devices, saved businesses and notification
 * choices deleted, open requests cancelled. Reviews and past jobs stay for the businesses' records,
 * shown under "Deleted user". Business owners and staff go through support, so a business is never
 * left without an owner by accident.
 */
export async function deleteAccount(userId: string, password: string): Promise<{ ok: true } | { ok: false; error: DeleteError }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true, _count: { select: { memberships: true } } } });
  if (!user || user.deletedAt) return { ok: false, error: "wrongPassword" };
  if (user.role !== "CUSTOMER" || user._count.memberships > 0) return { ok: false, error: "notCustomer" };
  if (!(await passwordMatches(userId, password))) return { ok: false, error: "wrongPassword" };
  if (await prisma.trip.count({ where: { customerId: userId, status: { in: [...ACTIVE_TRIP] } } })) return { ok: false, error: "activeTrip" };

  const now = new Date();
  // Unguessable and never shown: nobody can sign in to a deleted account.
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { name: DELETED_NAME, email: deletedEmail(userId), phone: null, passwordHash, passwordChangedAt: now, totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, deletedAt: now },
    });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.favorite.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.serviceRequest.updateMany({ where: { customerId: userId, status: { in: ["OPEN", "ACCEPTED"] } }, data: { status: "CANCELLED" } });
    await audit(tx, { actorId: userId, action: "account.deleted", entityType: "User", entityId: userId });
  });
  return { ok: true };
}
