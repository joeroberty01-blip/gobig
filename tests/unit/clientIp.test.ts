import { afterEach, describe, expect, it } from "vitest";
import { clientIpFrom } from "@/lib/clientIp";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS;
  delete process.env.CLIENT_IP_HEADER;
});

describe("client address for rate limits (SEC-052)", () => {
  it("ignores addresses the client made up: takes the one our edge appended", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, 41.59.1.2" }))).toBe("41.59.1.2");
    expect(clientIpFrom(h({ "x-forwarded-for": "41.59.1.2" }))).toBe("41.59.1.2");
  });

  it("skips extra trusted hops when configured", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, 41.59.1.2, 10.0.0.1" }))).toBe("41.59.1.2");
  });

  it("uses a platform header when named, and falls back sensibly", () => {
    process.env.CLIENT_IP_HEADER = "cf-connecting-ip";
    expect(clientIpFrom(h({ "cf-connecting-ip": "41.59.9.9", "x-forwarded-for": "6.6.6.6, 1.1.1.1" }))).toBe("41.59.9.9");
    delete process.env.CLIENT_IP_HEADER;
    expect(clientIpFrom(h({ "x-real-ip": "41.59.3.3" }))).toBe("41.59.3.3");
    expect(clientIpFrom(h({}))).toBe("unknown");
  });
});
