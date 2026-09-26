// Small in-process cache for reference data that changes rarely (areas, catalogue, levels) —
// Phase 13. Each server instance keeps its own copy for `ttlMs`; concurrent callers share one
// in-flight load. Admin edits call invalidate() so the instance that handled the edit is fresh at
// once; other instances catch up within the TTL. Never cache per-user or private data here.

type Entry = { at: number; ttl: number; value: Promise<unknown> };
const store = new Map<string, Entry>();

export function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), ttl: ttlMs, value });
  // A failed load must not be cached.
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  return value;
}

/** Drops every entry whose key starts with one of the prefixes (no prefix = everything). */
export function invalidate(...prefixes: string[]): void {
  for (const key of [...store.keys()]) {
    if (!prefixes.length || prefixes.some((p) => key.startsWith(p))) store.delete(key);
  }
}

export const REFERENCE_TTL_MS = 5 * 60_000;
