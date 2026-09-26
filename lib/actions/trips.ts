"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import * as trips from "@/lib/services/trips";
import type { Point } from "@/lib/geo";

// Phase 17 server actions: authenticate → can() → service. Customer and provider ids always come
// from the session; the services check the trip belongs to the caller (or was offered to them).

export type TripActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: trips.TripError | "forbidden" };
const forbidden = { ok: false as const, error: "forbidden" as const };
const ID = /^[a-z0-9]{10,40}$/i;

function refresh() {
  revalidatePath("/trips", "layout");
  revalidatePath("/provider/driver", "layout");
}

async function customer() {
  const user = await getCurrentUser();
  return can(user, "trips:request") ? user! : null;
}

async function driver() {
  const user = await getCurrentUser();
  if (!can(user, "trips:drive")) return null;
  return getOwnedProviderId(user!.id);
}

// ─── Customer ───────────────────────────────────────────────────────────────────────────────

export async function requestTripAction(input: unknown): Promise<TripActionResult<{ tripId: string }>> {
  const user = await customer();
  if (!user) return forbidden;
  const r = await trips.requestTrip(user, input);
  if (r.ok) refresh();
  return r;
}

export async function cancelTripAction(tripId: string): Promise<TripActionResult> {
  const user = await customer();
  if (!user || !ID.test(tripId)) return forbidden;
  const r = await trips.cancelByCustomer(user.id, tripId);
  if (r.ok) refresh();
  return r;
}

export async function rateTripAction(tripId: string, input: { rating: number; comment?: string }): Promise<TripActionResult> {
  const user = await customer();
  if (!user || !ID.test(tripId)) return forbidden;
  const r = await trips.rateTrip(user.id, tripId, input);
  if (r.ok) refresh();
  return r;
}

// ─── Driver ─────────────────────────────────────────────────────────────────────────────────

export async function saveDriverProfileAction(input: unknown): Promise<TripActionResult> {
  const providerId = await driver();
  if (!providerId) return forbidden;
  const r = await trips.saveDriverProfile(providerId, input);
  if (r.ok) refresh();
  return r;
}

export async function setOnlineAction(online: boolean, at?: Point): Promise<TripActionResult> {
  const providerId = await driver();
  if (!providerId) return forbidden;
  const r = await trips.setOnline(providerId, online, at);
  if (r.ok) refresh();
  return r;
}

export async function acceptOfferAction(offerId: string): Promise<TripActionResult<{ tripId: string }>> {
  const providerId = await driver();
  if (!providerId || !ID.test(offerId)) return forbidden;
  const r = await trips.acceptOffer(providerId, offerId);
  refresh();
  return r;
}

export async function declineOfferAction(offerId: string): Promise<TripActionResult> {
  const providerId = await driver();
  if (!providerId || !ID.test(offerId)) return forbidden;
  const r = await trips.declineOffer(providerId, offerId);
  refresh();
  return r;
}

export async function arrivedAction(tripId: string): Promise<TripActionResult> {
  const providerId = await driver();
  if (!providerId || !ID.test(tripId)) return forbidden;
  const r = await trips.markArrived(providerId, tripId);
  refresh();
  return r;
}

export async function startTripAction(tripId: string, code?: string): Promise<TripActionResult> {
  const providerId = await driver();
  if (!providerId || !ID.test(tripId)) return forbidden;
  const r = await trips.startTrip(providerId, tripId, code);
  refresh();
  return r;
}

export async function completeTripAction(tripId: string, input: { fareFinal: number; paymentMethod: string; code?: string }): Promise<TripActionResult> {
  const providerId = await driver();
  if (!providerId || !ID.test(tripId)) return forbidden;
  const r = await trips.completeTrip(providerId, tripId, input);
  refresh();
  return r;
}

export async function driverCancelAction(tripId: string, reason: string): Promise<TripActionResult> {
  const providerId = await driver();
  if (!providerId || !ID.test(tripId)) return forbidden;
  const r = await trips.cancelByDriver(providerId, tripId, String(reason ?? ""));
  refresh();
  return r;
}
