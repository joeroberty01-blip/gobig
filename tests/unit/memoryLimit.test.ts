import { describe, expect, it } from "vitest";
import { createMemoryLimiter } from "@/lib/memoryLimit";

describe("in-memory limiter (SEC-010)", () => {
  it("allows up to max per window, then refuses with a retry time", () => {
    const l = createMemoryLimiter({ max: 3, windowMs: 60_000 });
    const t = 1_000_000;
    expect([1, 2, 3].map(() => l.hit("1.2.3.4", t).ok)).toEqual([true, true, true]);
    expect(l.hit("1.2.3.4", t + 10_000)).toEqual({ ok: false, retryAfterSec: 50 });
    expect(l.hit("5.6.7.8", t + 10_000).ok).toBe(true); // other addresses unaffected
    expect(l.hit("1.2.3.4", t + 60_000).ok).toBe(true); // new window
  });

  it("stays bounded under a flood of distinct keys", () => {
    const l = createMemoryLimiter({ max: 1, windowMs: 60_000 });
    for (let i = 0; i < 60_000; i++) l.hit(`k${i}`, 5);
    expect(l.size()).toBeLessThanOrEqual(50_000);
  });
});
