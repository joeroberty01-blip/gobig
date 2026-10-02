"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { passwordSchema } from "@/lib/validators/auth";
import { changePassword, deleteAccount, signOutEverywhere, updateName } from "@/lib/services/account";

// Settings page. The account is always the signed-in person's own (id from the session).

export type AccountResult = { ok: true } | { ok: false; error: string };

async function me() {
  const user = await getCurrentUser();
  return user ? user.id : null;
}

export async function updateNameAction(name: unknown): Promise<AccountResult> {
  const id = await me();
  if (!id || typeof name !== "string") return { ok: false, error: "generic" };
  if (!(await hit(LIMITS.accountEditPerUser, id)).ok) return { ok: false, error: "rateLimited" };
  const r = await updateName(id, name);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function changePasswordAction(current: unknown, next: unknown): Promise<AccountResult> {
  const id = await me();
  if (!id || typeof current !== "string" || current.length > 128) return { ok: false, error: "generic" };
  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "generic" };
  if (!(await hit(LIMITS.accountPasswordPerUser, id)).ok) return { ok: false, error: "rateLimited" };
  return changePassword(id, current, parsed.data);
}

export async function signOutEverywhereAction(): Promise<AccountResult> {
  const id = await me();
  if (!id) return { ok: false, error: "generic" };
  if (!(await hit(LIMITS.accountEditPerUser, id)).ok) return { ok: false, error: "rateLimited" };
  await signOutEverywhere(id);
  return { ok: true };
}

export async function deleteAccountAction(password: unknown, confirm: unknown): Promise<AccountResult> {
  const id = await me();
  if (!id || typeof password !== "string" || password.length > 128 || confirm !== true) return { ok: false, error: "generic" };
  if (!(await hit(LIMITS.accountPasswordPerUser, id)).ok) return { ok: false, error: "rateLimited" };
  return deleteAccount(id, password);
}
