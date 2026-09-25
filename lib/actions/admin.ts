"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { createAdminUser } from "@/lib/services/auth";
import { audit } from "@/lib/services/audit";
import { prisma } from "@/lib/db";
import { createAdminSchema, type CreateAdminInput } from "@/lib/validators/auth";
import type { ActionResult } from "@/lib/actions/auth";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Super admins only. Admin accounts can never be self-registered. */
export async function createAdminAction(input: CreateAdminInput): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "admins:create")) return { ok: false, error: "forbidden" };

  const parsed = createAdminSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: (issue?.message as keyof Dictionary["errors"]) ?? "generic",
      field: issue?.path[0]?.toString(),
    };
  }

  const result = await createAdminUser(parsed.data);
  if (!result.ok) return { ok: false, error: "emailTaken", field: "email" };
  // SEC-014: who created which admin, and when. (No password or email in the metadata.)
  await audit(prisma, { actorId: actor!.id, action: "admin.created", entityType: "User", entityId: result.id });

  revalidatePath("/admin/users");
  return { ok: true };
}
