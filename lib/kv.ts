import "server-only";
import Redis from "ioredis";
import { log } from "@/lib/log";

// Phase 16: optional Redis (REDIS_URL). Everything that uses it has a Postgres or in-process
// fallback, so the app runs without Redis and keeps running if Redis goes away: commands fail
// fast (no offline queue) and callers fall back. Keys are namespaced "nexa:".

const g = globalThis as unknown as { nexaRedis?: Redis | null };

export function redis(): Redis | null {
  if (g.nexaRedis !== undefined) return g.nexaRedis;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return (g.nexaRedis = null);
  const client = new Redis(url, {
    lazyConnect: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    commandTimeout: 500,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  client.on("error", (err) => log.warn("redis error", { error: err.message }));
  return (g.nexaRedis = client);
}

export const kvKey = (...parts: string[]) => `nexa:${parts.join(":")}`;

/** Fixed-window counter: returns the count in this window and the window's remaining seconds. */
const INCR_WINDOW = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {c, ttl}`;

export async function incrWindow(key: string, windowSec: number): Promise<{ count: number; ttlSec: number } | null> {
  const r = redis();
  if (!r || r.status !== "ready") return null;
  try {
    const [count, ttl] = (await r.eval(INCR_WINDOW, 1, kvKey("rl", key), windowSec)) as [number, number];
    return { count, ttlSec: ttl };
  } catch (err) {
    log.warn("redis rate-limit fallback", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function delKey(key: string): Promise<void> {
  const r = redis();
  if (!r || r.status !== "ready") return;
  await r.del(kvKey("rl", key)).catch(() => undefined);
}
