import { prisma } from "@/lib/db";
import { aiConfigured, claudeRewriteRequest } from "@/lib/ai/claude";
import { cleanMissing, guardRewrite, MAX_ASSIST_CHARS, MIN_ASSIST_CHARS, ruleMissing, type MissingCode } from "@/lib/ai/assist";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { hit, LIMITS } from "@/lib/services/rateLimit";

// Automation Engine, Phase E: "Help me write" on the request form. The customer always sees the
// suggestion first and chooses whether to use it — nothing is posted or changed automatically.

export type AssistResult =
  | { ok: true; suggestion: string; rewritten: boolean; missing: MissingCode[]; source: "ai" | "rules" }
  | { ok: false; error: "tooShort" | "tooLong" | "rateLimited" };

export async function assistRequest(
  customerId: string,
  rawText: string,
  serviceId: string | null,
  opts: { useAi?: boolean } = {},
): Promise<AssistResult> {
  const text = String(rawText ?? "").trim();
  if (text.length < MIN_ASSIST_CHARS) return { ok: false, error: "tooShort" };
  if (text.length > MAX_ASSIST_CHARS) return { ok: false, error: "tooLong" };
  if (!(await hit(LIMITS.aiAssistPerUser, customerId)).ok) return { ok: false, error: "rateLimited" };

  const service = serviceId ? await prisma.service.findFirst({ where: { id: serviceId, isActive: true }, select: { slug: true, nameEn: true } }) : null;
  // Same switches as AI search: the admin toggle and the platform-wide daily cap (SEC-036).
  const aiOn = opts.useAi !== false && aiConfigured() && (await getPlatformSettings()).aiSearchEnabled && (await hit(LIMITS.aiGlobalDaily, "all")).ok;
  const ai = aiOn ? await claudeRewriteRequest(text, service?.nameEn ?? null) : null;

  if (ai) {
    const guarded = guardRewrite(text, ai.description);
    const missing = cleanMissing(ai.missing);
    return { ok: true, suggestion: guarded.text, rewritten: guarded.usedRewrite, missing, source: "ai" };
  }
  return { ok: true, suggestion: guardRewrite(text, null).text, rewritten: false, missing: ruleMissing(text, service?.slug ?? null), source: "rules" };
}
