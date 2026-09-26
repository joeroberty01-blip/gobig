import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { tick } from "@/lib/jobs/handlers";

// Phase 16: lets a scheduler (Render Cron Job, an uptime pinger) drain the job queue when no
// worker process runs. Needs `Authorization: Bearer <CRON_SECRET>`; disabled when CRON_SECRET is blank.
export const dynamic = "force-dynamic";

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(header.slice(7)).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req.headers.get("authorization"))) return new NextResponse(null, { status: 404 });
  const result = await tick({ limit: 50 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
