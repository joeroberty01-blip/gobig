import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/permissions";
import { isSameOrigin } from "@/lib/security";
import { getCurrentUser } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { updateDriverLocation } from "@/lib/services/trips";

// Phase 17: position ping from an online driver's open app (~every 5 s). Stored only while online.
export const dynamic = "force-dynamic";
const body = z.object({ lat: z.number().finite(), lng: z.number().finite() });

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!can(user, "trips:drive")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const providerId = await getOwnedProviderId(user!.id);
  if (!providerId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const text = await req.text();
  if (text.length > 200) return NextResponse.json({ error: "invalid" }, { status: 400 });
  let parsed;
  try {
    parsed = body.safeParse(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const r = await updateDriverLocation(providerId, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "rateLimited" ? 429 : 409 });
  return new NextResponse(null, { status: 204 });
}
