import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/kv";

// Phase 16: for the host's health checks and uptime monitors. Says only up/down per dependency —
// no versions of libraries, hostnames or error text.
//
// Phase 19: the status code answers "is this server alive?" (200 while it runs), so the host
// doesn't restart a healthy server while the database wakes from sleep (Neon cold start can exceed a
// few seconds). Whether the database answered is in the body (`db`), for uptime monitors.
export const dynamic = "force-dynamic";

async function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export async function GET() {
  const db = await within(8_000, prisma.$queryRaw`SELECT 1`).then(() => "up" as const, () => "down" as const);
  const r = redis();
  const cache = !r ? "not-configured" : r.status === "ready" ? "up" : "down";
  return NextResponse.json(
    { ok: db === "up", db, redis: cache, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
