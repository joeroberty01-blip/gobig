import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { isSameOrigin } from "@/lib/security";
import { getCurrentUser } from "@/lib/session";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { removeSubscription, saveSubscription } from "@/lib/notifications/subscription";

// Automation Engine, Phase C: a signed-in person turns push on/off for this device.
// Same-origin only, rate limited, small bodies, endpoints restricted to real push services.
export const dynamic = "force-dynamic";
const MAX_BODY = 2_000;

async function readJson(req: Request): Promise<unknown | null> {
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function guard(req: Request) {
  if (!isSameOrigin(req.headers)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const user = await getCurrentUser();
  if (!can(user, "notifications:view")) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (!(await hit(LIMITS.pushSubscribePerUser, user!.id)).ok) return { error: NextResponse.json({ error: "rateLimited" }, { status: 429 }) };
  return { user: user! };
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const body = await readJson(req);
  const r = await saveSubscription(g.user.id, body);
  return r.ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "invalid" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const body = (await readJson(req)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 });
  await removeSubscription(g.user.id, body.endpoint);
  return new NextResponse(null, { status: 204 });
}
