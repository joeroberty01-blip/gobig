// In-memory fixed-window limiter for the proxy (Phase 13, SEC-010: search/profile scraping).
// Costs no database round trip, which matters on pages every visitor loads. Counts are per server
// instance, so on a multi-instance host a scraper gets N× the budget — a speed bump against bulk
// scraping, backed in production by the host's firewall rate rules (README › Deployment).
// Limits are generous on purpose: many mobile users in Tanzania share one carrier-NAT address.

type Window = { start: number; count: number };

export type MemoryLimit = { max: number; windowMs: number };

const MAX_KEYS = 50_000;

export function createMemoryLimiter(limit: MemoryLimit) {
  const windows = new Map<string, Window>();

  function prune(now: number) {
    for (const [k, w] of windows) if (now - w.start >= limit.windowMs) windows.delete(k);
    // Still too many distinct keys (a spoofed-address flood): drop the oldest half.
    if (windows.size >= MAX_KEYS) {
      const keys = [...windows.keys()].slice(0, Math.floor(MAX_KEYS / 2));
      for (const k of keys) windows.delete(k);
    }
  }

  return {
    hit(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
      let w = windows.get(key);
      if (!w || now - w.start >= limit.windowMs) {
        if (windows.size >= MAX_KEYS) prune(now);
        w = { start: now, count: 0 };
        windows.set(key, w);
      }
      w.count += 1;
      if (w.count > limit.max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.start + limit.windowMs - now) / 1000)) };
      return { ok: true };
    },
    size: () => windows.size,
  };
}

/**
 * Public discovery pages (search, profiles, categories, ask), per IP, prefetches included: 4 a
 * second sustained — far above one person browsing, far below a bulk scraper.
 */
export const DISCOVERY_PAGE_LIMIT: MemoryLimit = { max: 1200, windowMs: 5 * 60_000 };
