import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, type Action } from "@/lib/permissions";
import { roleHome, type Role } from "@/lib/roles";
import { mfaSatisfied } from "@/lib/services/twoFactor";

export type CurrentUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: "ACTIVE" | "SUSPENDED";
  locale: "sw" | "en";
  createdAt: Date;
  /** Admin whose session hasn't passed two-factor: holds no admin powers until it has (Phase 13). */
  mfaPending: boolean;
  totpEnabled: boolean;
};

/**
 * The signed-in user as the database sees them right now, or null. The JWT only says who
 * logged in; role, status and deletion are re-read so a suspension or role change applies
 * immediately, and a session older than the last password change is treated as signed out.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      locale: true,
      createdAt: true,
      passwordChangedAt: true,
      deletedAt: true,
      totpEnabledAt: true,
    },
  });
  if (!user || user.deletedAt) return null;
  if (!session.user.authAt || session.user.authAt < user.passwordChangedAt.getTime()) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    locale: user.locale,
    createdAt: user.createdAt,
    mfaPending: !mfaSatisfied(user.role, user.totpEnabledAt, session.user.mfa),
    totpEnabled: !!user.totpEnabledAt,
  };
});

/** For pages: sends guests to login and wrong roles to their own home. */
export async function requirePageAccess(action: Action, nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(nextPath)}`);
  if (user.status !== "ACTIVE") redirect("/");
  // Admins without a passed second factor are sent to set it up (or sign in again with it).
  if (user.mfaPending && !can(user, action)) redirect("/admin/security");
  if (!can(user, action)) redirect(roleHome(user.role));
  return user;
}
