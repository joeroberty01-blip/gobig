import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/kv";
import { log } from "@/lib/log";

// Phase 16: for the host's health checks and uptime monitors. Says only up/down per dependency —
// no versions of libraries, hostnames or error text.
export const dynamic = "force-dynamic";

async function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export async function GET(req: Request) {
  // TEMPORARY (Phase 19, SEC-052): records how the host's proxies pass client addresses — counts and
  // header names only, never the addresses. Removed once TRUSTED_PROXY_HOPS is decided.
  if (req.headers.get("x-nexa-probe") === "1") {
    const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").filter((x) => x.trim()).length;
    const present = ["x-real-ip", "cf-connecting-ip", "true-client-ip", "x-client-ip", "fly-client-ip", "rndr-id"].filter((k) => req.headers.has(k));
    log.info("edge header shape", { xffEntries: xff, headersPresent: present.join(" ") });
  }
  const db = await within(3_000, prisma.$queryRaw`SELECT 1`).then(() => "up" as const, () => "down" as const);
  const r = redis();
  const cache = !r ? "not-configured" : r.status === "ready" ? "up" : "down";
  const ok = db === "up";
  return NextResponse.json(
    { ok, db, redis: cache, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
