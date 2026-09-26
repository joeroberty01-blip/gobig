import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { driverActiveTrip, listDriverOffers } from "@/lib/services/trips";

// Phase 17: the online driver's open offers and current trip, polled by the driver screen.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!can(user, "trips:drive")) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const providerId = await getOwnedProviderId(user!.id);
  if (!providerId) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  if (!(await hit(LIMITS.tripPollPerUser, user!.id)).ok) return NextResponse.json({ error: "rateLimited" }, { status: 429, headers: NO_STORE });
  const [offers, active] = await Promise.all([listDriverOffers(providerId), driverActiveTrip(providerId)]);
  return NextResponse.json({ offers, activeTripId: active?.id ?? null }, { headers: NO_STORE });
}
