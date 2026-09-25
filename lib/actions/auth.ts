"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getLocale, LOCALE_COOKIE } from "@/lib/i18n/server";
import { isLocale } from "@/lib/i18n/dictionaries";
import { getCurrentUser } from "@/lib/session";
import { createPasswordResetToken, registerUser, resetPassword } from "@/lib/services/auth";
import { deliverPasswordReset } from "@/lib/services/notify";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { clientIp } from "@/lib/request";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signupSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type SignupFormInput,
} from "@/lib/validators/auth";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type ErrorKey = keyof Dictionary["errors"];
export type ActionResult = { ok: true } | { ok: false; error: ErrorKey; field?: string };

function firstIssue(issues: { message: string; path: PropertyKey[] }[]): ActionResult {
  const issue = issues[0];
  return {
    ok: false,
    error: (issue?.message as ErrorKey) ?? "generic",
    field: issue?.path[0]?.toString(),
  };
}

/** Creates a CUSTOMER or PROVIDER account. The client signs in straight after. */
export async function signupAction(input: SignupFormInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error.issues);
  if (!(await hit(LIMITS.signupPerIp, await clientIp())).ok) return { ok: false, error: "rateLimited" };

  const result = await registerUser(parsed.data, await getLocale());
  if (!result.ok) {
    return { ok: false, error: result.error, field: result.error === "phoneTaken" ? "phone" : "email" };
  }
  return { ok: true };
}

/** Always answers the same way, whether or not the account exists. */
export async function requestPasswordResetAction(input: ForgotPasswordInput): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error.issues);
  // Limited per address; the answer still says nothing about whether the account exists.
  if (!(await hit(LIMITS.resetPerIp, await clientIp())).ok) return { ok: false, error: "rateLimited" };

  const request = await createPasswordResetToken(parsed.data.identifier);
  if (request) await deliverPasswordReset(request);
  return { ok: true };
}

export async function resetPasswordAction(input: ResetPasswordInput): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error.issues);

  const ok = await resetPassword(parsed.data.token, parsed.data.password);
  return ok ? { ok: true } : { ok: false, error: "tokenInvalid" };
}

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  const user = await getCurrentUser();
  if (user) await prisma.user.update({ where: { id: user.id }, data: { locale } });
}
