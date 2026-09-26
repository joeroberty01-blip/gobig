import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/kv";

// Phase 16: for the host's health checks and uptime monitors. Says only up/down per dependency —
// no versions of libraries, hostnames or error text.
export const dynamic = "force-dynamic";

async function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export async function GET() {
  const db = await within(3_000, prisma.$queryRaw`SELECT 1`).then(() => "up" as const, () => "down" as const);
  const r = redis();
  const cache = !r ? "not-configured" : r.status === "ready" ? "up" : "down";
  const ok = db === "up";
  return NextResponse.json(
    { ok, db, redis: cache, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
