import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { tripForCustomer, tripForDriver } from "@/lib/services/trips";

// Phase 17: live status for an open trip screen (polled every few seconds). The customer gets
// their own trip; a driver gets it only if it is theirs or offered to them. Anyone else: 404.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user || user.status !== "ACTIVE" || !/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: "notFound" }, { status: 404, headers: NO_STORE });
  if (!(await hit(LIMITS.tripPollPerUser, user.id)).ok) return NextResponse.json({ error: "rateLimited" }, { status: 429, headers: NO_STORE });
  let trip: unknown = null;
  if (can(user, "trips:request")) trip = await tripForCustomer(user.id, id);
  else if (can(user, "trips:drive")) {
    const providerId = await getOwnedProviderId(user.id);
    if (providerId) trip = await tripForDriver(providerId, id);
  }
  if (!trip) return NextResponse.json({ error: "notFound" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(trip, { headers: NO_STORE });
}
