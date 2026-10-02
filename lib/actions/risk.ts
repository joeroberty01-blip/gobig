"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { resolveRiskFlag } from "@/lib/services/admin/risk";

const input = z.object({ id: z.string().min(1).max(40), outcome: z.enum(["ACTIONED", "DISMISSED"]), note: z.string().trim().min(3).max(500) });

export async function resolveRiskFlagAction(raw: unknown): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "reports:manage")) return { ok: false };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const ok = await resolveRiskFlag(user.id, parsed.data.id, parsed.data.outcome, parsed.data.note);
  if (ok) revalidatePath("/admin/risk");
  return { ok };
}
