import { prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import {
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  newRecoveryCodes,
  newSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "@/lib/totp";

// Two-factor login (Phase 13, SEC-042). Required for ADMIN and SUPER_ADMIN; the permission check
// withholds every admin power from a session that hasn't passed it (lib/permissions.ts).

export type TwoFactorError = "alreadyEnabled" | "notStarted" | "otpInvalid" | "notFound" | "superAdminOnly" | "cannotSelf";
export type TResult<T = object> = ({ ok: true } & T) | { ok: false; error: TwoFactorError };

export const MFA_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

/** Starts (or restarts) enrollment: a new secret, stored encrypted but not active until confirmed. */
export async function beginEnrollment(userId: string): Promise<TResult<{ secret: string; uri: string }>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true, name: true, totpEnabledAt: true } });
  if (!user) return { ok: false, error: "notFound" };
  if (user.totpEnabledAt) return { ok: false, error: "alreadyEnabled" };
  const secret = newSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret), totpLastStep: null } });
  return { ok: true, secret, uri: otpauthUri(secret, user.email ?? user.phone ?? user.name) };
}

/** Confirms enrollment with a code from the app; returns one-time recovery codes (shown once). */
export async function confirmEnrollment(userId: string, code: string, now = new Date()): Promise<TResult<{ recoveryCodes: string[] }>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabledAt: true } });
  if (!user) return { ok: false, error: "notFound" };
  if (user.totpEnabledAt) return { ok: false, error: "alreadyEnabled" };
  if (!user.totpSecretEnc) return { ok: false, error: "notStarted" };
  const step = verifyTotp(decryptSecret(user.totpSecretEnc), code, now);
  if (step == null) return { ok: false, error: "otpInvalid" };
  const codes = newRecoveryCodes();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { totpEnabledAt: now, totpLastStep: step } });
    await tx.totpRecoveryCode.deleteMany({ where: { userId } });
    await tx.totpRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) });
    await audit(tx, { actorId: userId, action: "security.totp_enabled", entityType: "User", entityId: userId });
  });
  return { ok: true, recoveryCodes: codes };
}

/**
 * Second step of login. Accepts a current authenticator code (each code usable once) or an unused
 * recovery code (then spent). Both updates are conditional, so two simultaneous logins can't
 * reuse the same code.
 */
export async function verifySecondFactor(userId: string, input: string, now = new Date()): Promise<{ ok: boolean; method?: "totp" | "recovery" }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabledAt: true, totpLastStep: true } });
  if (!user?.totpEnabledAt || !user.totpSecretEnc) return { ok: false };

  const step = verifyTotp(decryptSecret(user.totpSecretEnc), input, now, user.totpLastStep);
  if (step != null) {
    const claimed = await prisma.user.updateMany({
      where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return claimed.count === 1 ? { ok: true, method: "totp" } : { ok: false };
  }

  const recovery = normalizeRecoveryCode(input);
  if (!recovery) return { ok: false };
  const used = await prisma.totpRecoveryCode.updateMany({ where: { userId, codeHash: hashRecoveryCode(recovery), usedAt: null }, data: { usedAt: now } });
  if (used.count !== 1) return { ok: false };
  await audit(prisma, { actorId: userId, action: "security.recovery_code_used", entityType: "User", entityId: userId });
  return { ok: true, method: "recovery" };
}

export async function hasTwoFactor(userId: string): Promise<boolean> {
  return (await prisma.user.count({ where: { id: userId, totpEnabledAt: { not: null } } })) > 0;
}

/** Admins must have two-factor on AND have used it for this session (Phase 13). */
export function mfaSatisfied(role: string, totpEnabledAt: Date | null, sessionMfa: boolean | undefined): boolean {
  if (!MFA_ROLES.has(role)) return true;
  return !!totpEnabledAt && sessionMfa === true;
}

export async function twoFactorStatus(userId: string) {
  const [user, remaining] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } }),
    prisma.totpRecoveryCode.count({ where: { userId, usedAt: null } }),
  ]);
  return { enabledAt: user?.totpEnabledAt ?? null, recoveryCodesLeft: remaining };
}

/** New recovery codes (old ones stop working). Requires a current authenticator code. */
export async function regenerateRecoveryCodes(userId: string, code: string, now = new Date()): Promise<TResult<{ recoveryCodes: string[] }>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabledAt: true, totpLastStep: true } });
  if (!user?.totpEnabledAt || !user.totpSecretEnc) return { ok: false, error: "notStarted" };
  const step = verifyTotp(decryptSecret(user.totpSecretEnc), code, now, user.totpLastStep);
  if (step == null) return { ok: false, error: "otpInvalid" };
  const codes = newRecoveryCodes();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { totpLastStep: step } });
    await tx.totpRecoveryCode.deleteMany({ where: { userId } });
    await tx.totpRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) });
    await audit(tx, { actorId: userId, action: "security.recovery_codes_regenerated", entityType: "User", entityId: userId });
  });
  return { ok: true, recoveryCodes: codes };
}

/**
 * A super admin clears another admin's two-factor (lost phone and recovery codes). The admin must
 * set it up again at their next sign-in; their current sessions lose admin powers at once.
 */
export async function resetTwoFactor(actor: { id: string; role: string }, userId: string, reason: string): Promise<TResult> {
  if (actor.role !== "SUPER_ADMIN") return { ok: false, error: "superAdminOnly" };
  if (actor.id === userId) return { ok: false, error: "cannotSelf" };
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) return { ok: false as const, error: "notFound" as const };
    await tx.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null } });
    await tx.totpRecoveryCode.deleteMany({ where: { userId } });
    await audit(tx, { actorId: actor.id, action: "security.totp_reset", entityType: "User", entityId: userId, metadata: { reason } });
    return { ok: true as const };
  });
}
