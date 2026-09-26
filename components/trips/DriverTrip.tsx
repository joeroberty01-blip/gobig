"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, MapPin, Navigation, Package, Phone, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { MapView } from "@/components/map/MapView";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { acceptOfferAction, arrivedAction, completeTripAction, driverCancelAction, startTripAction } from "@/lib/actions/trips";
import { formatTzs } from "@/lib/provider/format";
import type { DriverTrip as Trip } from "@/lib/services/trips";
import { TripChat } from "./TripChat";

const LIVE = ["REQUESTED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"];
const METHODS = ["CASH", "MPESA", "TIGO_PESA", "AIRTEL_MONEY", "HALOPESA", "BANK_TRANSFER"] as const;

/** geo: opens the phone's own map app — the customer's point isn't sent to a website. */
const geo = (p: { lat: number; lng: number }) => `geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}`;

export function DriverTrip({ initial }: { initial: Trip }) {
  const { t } = useI18n();
  const tr = t.trips;
  const router = useRouter();
  const [trip, setTrip] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [fare, setFare] = useState(initial.fareEstimate ?? 0);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("CASH");
  const err = (e: string) => (e === "forbidden" ? tr.errors.notAllowed : (tr.errors as Record<string, string>)[e] ?? tr.errors.invalid);

  useEffect(() => {
    if (!LIVE.includes(trip.status)) return;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/trips/${trip.id}`, { cache: "no-store" });
        if (r.ok) setTrip(await r.json());
        else if (r.status === 404) router.push("/provider/driver"); // taken by someone else / cancelled offer
      } catch {
        // next tick
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [trip.status, trip.id, router]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(err(r.error ?? "invalid"));
      const res = await fetch(`/api/trips/${trip.id}`, { cache: "no-store" });
      if (res.ok) setTrip(await res.json());
      setCode("");
    });

  const statusText = (trip.kind === "DELIVERY" ? tr.statusDelivery : tr.status)[trip.status as keyof typeof tr.status];
  const markers = [
    ...(trip.pickup ? [{ id: "p", ...trip.pickup, precision: "exact" as const, label: tr.pickup }] : []),
    ...(trip.dropoff ? [{ id: "d", ...trip.dropoff, precision: "exact" as const, label: trip.dropoffLabel }] : []),
  ];
  const next = trip.status === "IN_PROGRESS" ? trip.dropoff : trip.pickup;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl nav-gradient p-5 text-white shadow-lift">
        <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">{trip.kind === "RIDE" ? tr.rideShort : tr.deliveryShort}</p>
        <h1 className="mt-1 text-2xl font-extrabold">{statusText}</h1>
        <ol className="mt-3 flex flex-col gap-1.5 text-sm">
          <li className="flex items-center gap-2">
            <MapPin aria-hidden className="size-4 text-emerald-300" /> {trip.pickupLabel}
          </li>
          <li className="flex items-center gap-2">
            <Flag aria-hidden className="size-4 text-cta" /> {trip.dropoffLabel}
            <span className="ml-auto text-white/60">{fill(tr.distance, { km: trip.distanceKm.toFixed(1) })}</span>
          </li>
        </ol>
        {trip.fareEstimate != null && <p className="mt-3 text-sm text-white/80">{fill(tr.yourFare, { fare: trip.fareEstimate.toLocaleString("en-US") })}</p>}
      </div>

      {trip.offer && trip.status === "REQUESTED" && (
        <Button variant="cta" className="min-h-12" disabled={pending} onClick={() => act(async () => {
          const r = await acceptOfferAction(trip.offer!.id);
          return r;
        })}>
          {tr.accept}
        </Button>
      )}

      {trip.mine && LIVE.includes(trip.status) && (
        <Card className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-muted">{tr.customer}</p>
            <p className="font-bold">{trip.customerFirstName}</p>
            {trip.note && <p className="mt-1 text-sm text-ink-muted">“{trip.note}”</p>}
          </div>
          {trip.customerPhone && (
            <a href={`tel:+${trip.customerPhone}`} aria-label={tr.call} className="grid size-12 place-items-center rounded-full bg-whatsapp text-white">
              <Phone aria-hidden className="size-5" />
            </a>
          )}
          {next && (
            <a href={geo(next)} className="flex min-h-12 items-center gap-1.5 rounded-xl bg-action px-3 text-sm font-semibold text-white">
              <Navigation aria-hidden className="size-4" />
              {tr.navigate}
            </a>
          )}
        </Card>
      )}

      {trip.mine && (
        <TripChat
          tripId={trip.id}
          me="DRIVER"
          other={trip.customerFirstName}
          messages={trip.messages}
          canChat={trip.canChat}
          whatsapp={trip.customerPhone}
          onSent={async () => {
            const r = await fetch(`/api/trips/${trip.id}`, { cache: "no-store" });
            if (r.ok) setTrip(await r.json());
          }}
        />
      )}

      {trip.kind === "DELIVERY" && (trip.packageDescription || trip.recipientName) && (
        <Card className="flex items-start gap-3 text-sm">
          <Package aria-hidden className="mt-0.5 size-5 shrink-0 text-cta" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{trip.packageDescription}</p>
            <p className="text-ink-muted">
              {trip.packageSize && tr.sizes[trip.packageSize as keyof typeof tr.sizes]}
              {trip.fragile && ` · ${tr.fragile}`}
            </p>
            {trip.recipientName && (
              <p className="mt-1">
                {tr.recipient}: <b>{trip.recipientName}</b>
                {trip.recipientPhone && (
                  <a href={`tel:+${trip.recipientPhone}`} className="ml-2 font-semibold text-link">
                    {tr.call}
                  </a>
                )}
              </p>
            )}
          </div>
        </Card>
      )}

      {markers.length > 0 && <MapView center={markers[0]!} zoom={14} markers={markers} fitToMarkers className="h-64" />}

      {error && <Alert>{error}</Alert>}

      {trip.mine && trip.status === "ACCEPTED" && (
        <Button variant="cta" className="min-h-12" disabled={pending} onClick={() => act(() => arrivedAction(trip.id))}>
          {tr.markArrived}
        </Button>
      )}

      {trip.mine && trip.status === "ARRIVED" && (
        <Card className="flex flex-col gap-3">
          {trip.kind === "RIDE" && (
            <Field id="pin" label={tr.enterPin}>
              <Input id="pin" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center font-mono text-2xl tracking-[0.4em]" />
            </Field>
          )}
          <Button variant="cta" className="min-h-12" disabled={pending || (trip.kind === "RIDE" && code.length !== 4)} onClick={() => act(() => startTripAction(trip.id, code))}>
            {trip.kind === "RIDE" ? tr.startRide : tr.pickedUp}
          </Button>
        </Card>
      )}

      {trip.mine && trip.status === "IN_PROGRESS" && (
        <Card className="flex flex-col gap-3">
          {trip.kind === "DELIVERY" && (
            <Field id="code" label={tr.enterCode}>
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center font-mono text-2xl tracking-[0.4em]" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field id="fare" label={tr.finalFare}>
              <Input id="fare" type="number" inputMode="numeric" min={0} step={100} value={fare || ""} onChange={(e) => setFare(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
            </Field>
            <Field id="method" label={tr.paymentMethod}>
              <select id="method" value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base">
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {tr.methods[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button variant="cta" className="min-h-12" disabled={pending || (trip.kind === "DELIVERY" && code.length !== 4)} onClick={() => act(() => completeTripAction(trip.id, { fareFinal: fare, paymentMethod: method, code }))}>
            {tr.complete}
          </Button>
        </Card>
      )}

      {trip.mine && trip.status === "COMPLETED" && (
        <Card className="flex flex-col gap-2 text-sm">
          {trip.fareFinal != null && (
            <p className="flex justify-between">
              {tr.fareFinal} <b>{formatTzs(trip.fareFinal)}</b>
            </p>
          )}
          {trip.rating && (
            <p className="flex items-center gap-1">
              {tr.yourRating}:
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} aria-hidden className={`size-4 ${n <= trip.rating! ? "fill-accent-400 text-accent-500" : "text-line"}`} />
              ))}
            </p>
          )}
        </Card>
      )}

      {trip.mine && (trip.status === "ACCEPTED" || trip.status === "ARRIVED") && (
        <Button
          variant="ghost"
          className="text-danger"
          disabled={pending}
          onClick={() => {
            const reason = window.prompt(tr.cancelReason);
            if (reason != null) act(() => driverCancelAction(trip.id, reason));
          }}
        >
          {tr.driverCancel}
        </Button>
      )}
    </div>
  );
}
