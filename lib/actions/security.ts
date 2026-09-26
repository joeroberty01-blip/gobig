"use server";

import QRCode from "qrcode";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import * as tf from "@/lib/services/twoFactor";

// Phase 13 (SEC-042): two-factor set-up for the signed-in admin, and a super admin's reset of
// another admin's two-factor. Codes are rate-limited like logins.

type ErrorKey = keyof Dictionary["errors"];
type Fail = { ok: false; error: ErrorKey };
const fail = (error: string): Fail => ({ ok: false, error: error as ErrorKey });

async function self() {
  const user = await getCurrentUser();
  return can(user, "security:manage-own") ? user! : null;
}

export async function beginTwoFactorAction(): Promise<{ ok: true; secret: string; qr: string } | Fail> {
  const user = await self();
  if (!user) return fail("forbidden");
  const r = await tf.beginEnrollment(user.id);
  if (!r.ok) return fail(r.error);
  // A data: URL image — rendered as <img>, never as injected markup.
  const qr = await QRCode.toDataURL(r.uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  return { ok: true, secret: r.secret, qr };
}

export async function confirmTwoFactorAction(code: string): Promise<{ ok: true; recoveryCodes: string[] } | Fail> {
  const user = await self();
  if (!user || typeof code !== "string" || code.length > 20) return fail("forbidden");
  if (!(await hit(LIMITS.loginPerIdentifier, `2fa:${user.id}`)).ok) return fail("rateLimited");
  const r = await tf.confirmEnrollment(user.id, code);
  return r.ok ? { ok: true, recoveryCodes: r.recoveryCodes } : fail(r.error);
}

export async function regenerateRecoveryCodesAction(code: string): Promise<{ ok: true; recoveryCodes: string[] } | Fail> {
  const user = await self();
  if (!user || typeof code !== "string" || code.length > 20) return fail("forbidden");
  if (!(await hit(LIMITS.loginPerIdentifier, `2fa:${user.id}`)).ok) return fail("rateLimited");
  const r = await tf.regenerateRecoveryCodes(user.id, code);
  return r.ok ? { ok: true, recoveryCodes: r.recoveryCodes } : fail(r.error);
}

export async function resetTwoFactorAction(input: { id: string; reason: string }): Promise<{ ok: true } | Fail> {
  const user = await getCurrentUser();
  if (!can(user, "users:manage") || user!.role !== "SUPER_ADMIN") return fail("forbidden");
  if (typeof input?.id !== "string" || input.id.length > 40 || typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.length > 500) return fail("noteRequired");
  const r = await tf.resetTwoFactor(user!, input.id, input.reason.trim());
  return r.ok ? { ok: true } : fail(r.error);
}
