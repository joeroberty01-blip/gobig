import "server-only";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { VISITOR_COOKIE, VISITOR_ID_PATTERN } from "@/lib/visitor";
import { isBot, isPrefetch, recordMetrics, sourceFromReferer, type MetricKind, type MetricSource } from "@/lib/services/metrics";

// Page-side helpers for provider analytics (Phase 10). Request data is read while rendering; the
// write happens in after(), once the page has been sent, so counting never slows a customer down
// and a failed write never breaks a page.

async function context() {
  const [h, c, viewer] = await Promise.all([headers(), cookies(), getCurrentUser()]);
  const visitorId = c.get(VISITOR_COOKIE)?.value;
  if (!visitorId || !VISITOR_ID_PATTERN.test(visitorId)) return null;
  if (isBot(h.get("user-agent")) || isPrefetch(h)) return null;
  return { h, visitorId, viewer: viewer ? { id: viewer.id, role: viewer.role } : null };
}

function schedule(kind: MetricKind, providerIds: string[], source: MetricSource, extra: { serviceId?: string | null; locationId?: string | null }, ctx: NonNullable<Awaited<ReturnType<typeof context>>>) {
  after(async () => {
    try {
      await recordMetrics({ kind, providerIds, source, ...extra, visitorId: ctx.visitorId, viewer: ctx.viewer });
    } catch {
      console.warn("[analytics] could not record metrics");
    }
  });
}

/** Call from pages that list providers (search, AI search, categories, home). */
export async function trackAppearances(providerIds: string[], source: MetricSource, filters: { serviceId?: string | null; locationId?: string | null } = {}) {
  if (!providerIds.length) return;
  const ctx = await context();
  if (ctx) schedule("SEARCH_APPEARANCE", providerIds, source, filters, ctx);
}

/** Call from the public profile page. The source is the page the customer came from. */
export async function trackProfileView(providerId: string) {
  const ctx = await context();
  if (ctx) schedule("PROFILE_VIEW", [providerId], sourceFromReferer(ctx.h.get("referer"), ctx.h.get("host")), {}, ctx);
}
