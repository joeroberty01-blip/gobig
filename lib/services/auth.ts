import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { identifierWhere, parseIdentifier } from "@/lib/identifier";
import type { Role } from "@/lib/roles";
import type { SignupData } from "@/lib/validators/auth";

// Core account logic with no Next.js dependencies, so it is unit/integration testable.
// Server actions in lib/actions/auth.ts are thin wrappers around these.

const BCRYPT_COST = 10;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
/** Minimum gap between two reset links for one account; stops a form being used to spam. */
export const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

// Compared against when the account doesn't exist, so a wrong identifier takes as long as a
// wrong password and response time doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type RegisterResult =
  | { ok: true; user: { id: string; role: Role } }
  | { ok: false; error: "emailTaken" | "phoneTaken" };

export async function registerUser(data: SignupData, locale: "sw" | "en" = "sw"): Promise<RegisterResult> {
  const passwordHash = await hashPassword(data.password);
  try {
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        passwordHash,
        role: data.role,
        locale,
      },
      select: { id: true, role: true },
    });
    return { ok: true, user };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = JSON.stringify(err.meta ?? {});
      return { ok: false, error: target.includes("phone") ? "phoneTaken" : "emailTaken" };
    }
    throw err;
  }
}

export type CredentialsResult =
  | { ok: true; user: { id: string; name: string; email: string | null; role: Role; status: "ACTIVE" } }
  | { ok: false; error: "invalid" | "suspended" };

export async function verifyCredentials(identifierRaw: string, password: string): Promise<CredentialsResult> {
  const id = parseIdentifier(identifierRaw);
  const user = id
    ? await prisma.user.findFirst({ where: { ...identifierWhere(id), deletedAt: null } })
    : null;

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { ok: false, error: "invalid" };
  if (user.status !== "ACTIVE") return { ok: false, error: "suspended" };

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return {
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, status: "ACTIVE" },
  };
}

export type ResetRequest = {
  user: { id: string; name: string; email: string | null; phone: string | null; locale: "sw" | "en" };
  token: string;
};

/**
 * Issues a single-use reset token. Returns null (and the caller shows the same generic message)
 * when there is no such active account or one was issued moments ago.
 */
export async function createPasswordResetToken(identifierRaw: string): Promise<ResetRequest | null> {
  const id = parseIdentifier(identifierRaw);
  if (!id) return null;
  const user = await prisma.user.findFirst({
    where: { ...identifierWhere(id), deletedAt: null, status: "ACTIVE" },
    select: { id: true, name: true, email: true, phone: true, locale: true },
  });
  if (!user) return null;

  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESET_REQUEST_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return null;

  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });
  return { user, token };
}

/** Is this token currently usable? Used to show "link expired" before the user types anything. */
export async function isResetTokenValid(token: string): Promise<boolean> {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { usedAt: true, expiresAt: true },
  });
  return !!row && !row.usedAt && row.expiresAt > new Date();
}

/**
 * Sets the new password, burns every outstanding token for the account, and moves
 * passwordChangedAt forward so sessions opened with the old password stop working.
 */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Claim the token atomically so two simultaneous submits can't both succeed.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;

    const row = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangedAt: now } });
    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });
}

export async function createAdminUser(input: { name: string; email: string; password: string }): Promise<
  { ok: true; id: string } | { ok: false; error: "emailTaken" }
> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: "ADMIN", locale: "en" },
      select: { id: true },
    });
    return { ok: true, id: user.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "emailTaken" };
    }
    throw err;
  }
}
