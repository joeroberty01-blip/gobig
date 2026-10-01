"use server";

import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { assistRequest, type AssistResult } from "@/lib/services/requestAssist";

// Automation Engine, Phase E: "Help me write" — customers only; the id comes from the session.
export async function assistRequestAction(text: string, serviceId: string | null): Promise<AssistResult | { ok: false; error: "forbidden" }> {
  const user = await getCurrentUser();
  if (!can(user, "requests:create")) return { ok: false, error: "forbidden" };
  const sid = typeof serviceId === "string" && /^[a-z0-9]{10,40}$/i.test(serviceId) ? serviceId : null;
  return assistRequest(user!.id, String(text ?? ""), sid);
}
