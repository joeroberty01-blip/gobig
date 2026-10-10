import "server-only";
import { cookies } from "next/headers";
import { clientIp } from "@/lib/request";
import { VISITOR_COOKIE, VISITOR_ID_PATTERN } from "@/lib/visitor";
import { hit, LIMITS } from "@/lib/services/rateLimit";

/**
 * AI allowance for this visitor (Go Big AI page and chat): over the limit, the rule-based parser
 * answers instead (free), so nobody is blocked — the paid model is just not used.
 */
export async function aiAllowed(): Promise<boolean> {
  const vid = (await cookies()).get(VISITOR_COOKIE)?.value;
  const ipOk = (await hit(LIMITS.aiSearchPerIp, await clientIp())).ok;
  const visitorOk = vid && VISITOR_ID_PATTERN.test(vid) ? (await hit(LIMITS.aiSearchPerVisitor, vid)).ok : true;
  return ipOk && visitorOk;
}
