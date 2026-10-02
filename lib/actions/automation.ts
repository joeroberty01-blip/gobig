"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { retryDeadRun, saveRuleSettings } from "@/lib/automation/engine";
import { retryDeadJob } from "@/lib/automation/control";

// Automation Engine (Phase B) admin actions. Changing rules is a super-admin power (after 2FA,
// enforced inside can()); the engine validates settings with each rule's own schema and audits.

export type AutomationActionResult = { ok: true } | { ok: false; error: "forbidden" | "unknownRule" | "invalid" | "notFound" | "notRetryable" };

function refresh() {
  revalidatePath("/admin/automation");
  revalidatePath("/admin/settings");
}

export async function saveAutomationRuleAction(ruleId: string, input: { enabled: boolean; params: Record<string, unknown> }): Promise<AutomationActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "settings:manage")) return { ok: false, error: "forbidden" };
  const r = await saveRuleSettings(user!.id, String(ruleId), input);
  if (r.ok) refresh();
  return r;
}

export async function retryAutomationRunAction(runId: string): Promise<AutomationActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "settings:manage")) return { ok: false, error: "forbidden" };
  const r = await retryDeadRun(user!.id, String(runId));
  if (r.ok) refresh();
  return r;
}

/** Phase I: run a permanently failed background job again (audited). */
export async function retryJobAction(jobId: string): Promise<AutomationActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "settings:manage")) return { ok: false, error: "forbidden" };
  const r = await retryDeadJob(user!.id, String(jobId));
  if (r.ok) refresh();
  return r;
}
