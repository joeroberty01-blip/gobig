"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import * as bookings from "@/lib/services/bookings";

// Automation Engine, Phase D: booking and away-mode actions. The acting side comes from the
// session (a customer's own user id, or the provider owned by the signed-in user) — never from input.

export type BookingActionResult = { ok: true; affected?: number } | { ok: false; error: bookings.BookingError | "forbidden" | "invalidTime" | "tooFar" };
const ID = /^[a-z0-9]{10,40}$/i;

async function actor(): Promise<bookings.BookingActor | null> {
  const user = await getCurrentUser();
  if (can(user, "requests:create")) return { side: "CUSTOMER", customerId: user!.id };
  if (can(user, "requests:respond")) {
    const providerId = await getOwnedProviderId(user!.id);
    return providerId ? { side: "PROVIDER", providerId } : null;
  }
  return null;
}

function refresh(requestId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/provider/requests/${requestId}`);
}

export async function proposeTimeAction(requestId: string, whenLocal: string, note: string): Promise<BookingActionResult> {
  const a = await actor();
  if (!a || !ID.test(requestId)) return { ok: false, error: "forbidden" };
  const r = await bookings.proposeTime(a, requestId, String(whenLocal), String(note ?? ""));
  if (r.ok) refresh(requestId);
  return r;
}

export async function confirmBookingAction(requestId: string): Promise<BookingActionResult> {
  const a = await actor();
  if (!a || !ID.test(requestId)) return { ok: false, error: "forbidden" };
  const r = await bookings.confirmBooking(a, requestId);
  if (r.ok) refresh(requestId);
  return r;
}

export async function cancelBookingAction(requestId: string): Promise<BookingActionResult> {
  const a = await actor();
  if (!a || !ID.test(requestId)) return { ok: false, error: "forbidden" };
  const r = await bookings.cancelBooking(a, requestId);
  if (r.ok) refresh(requestId);
  return r;
}

export async function setAwayAction(untilLocal: string | null, note: string): Promise<BookingActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "provider:edit-own")) return { ok: false, error: "forbidden" };
  const providerId = await getOwnedProviderId(user!.id);
  if (!providerId) return { ok: false, error: "forbidden" };
  const r = await bookings.setAway(providerId, untilLocal === null ? null : String(untilLocal), String(note ?? ""));
  if (r.ok) revalidatePath("/provider", "layout");
  return r;
}
