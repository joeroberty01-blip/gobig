// Phase 19 (SEC-052): the client address used for rate limiting, from request headers.
//
// X-Forwarded-For is a list that every proxy *appends* to, so its first entry is whatever the
// client chose to send — trusting it lets anyone dodge per-address limits by inventing an address
// per request. The address our own edge saw is the entry `TRUSTED_PROXY_HOPS` from the right.
// A host that sets a dedicated header it overwrites (e.g. `cf-connecting-ip`) can name it in
// CLIENT_IP_HEADER instead. Used only to count attempts, never for authorization.
//
// Pure (no Next imports) so both the proxy and route handlers can use it.

type HeaderBag = { get(name: string): string | null };

export function clientIpFrom(h: HeaderBag): string {
  const header = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (header) {
    const v = h.get(header)?.trim();
    if (v) return v;
  }
  const hops = Math.max(1, Math.min(5, Number(process.env.TRUSTED_PROXY_HOPS) || 1));
  const list = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length) return list[Math.max(0, list.length - hops)]!;
  return h.get("x-real-ip")?.trim() || "unknown";
}
