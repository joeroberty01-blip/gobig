"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bike, Car, LocateFixed, MapPin, Package, Flag, Truck, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { MapView } from "@/components/map/MapView";
import { Alert, Button, Field, Input } from "@/components/ui";
import { requestTripAction } from "@/lib/actions/trips";
import { DAR_CENTER, distanceKm, type Point } from "@/lib/geo";

type Kind = "RIDE" | "DELIVERY";
type Vehicle = "BODA" | "BAJAJI" | "CAR" | "VAN";
const VEHICLE_ICON: Record<Vehicle, typeof Car> = { BODA: Bike, BAJAJI: Car, CAR: Car, VAN: Truck };

/**
 * Ride / delivery request (Phase 17). The customer places two pins; exact points go to the server
 * once, where they're encrypted. Nothing about price is invented here: each driver's own rates
 * give the fare once someone accepts.
 */
type Place = { slug: string; name: string; point: Point };

export function TripRequestForm({ kind, destination, origin }: { kind: Kind; destination?: Place | null; origin?: Place | null }) {
  const { t } = useI18n();
  const tr = t.trips;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pickup, setPickup] = useState<Point | null>(origin?.point ?? null);
  const [dropoff, setDropoff] = useState<Point | null>(destination?.point ?? null);
  const [stage, setStage] = useState<"pickup" | "dropoff">(origin ? "dropoff" : "pickup");
  const [locating, setLocating] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle>("BODA");
  const [note, setNote] = useState("");
  const [size, setSize] = useState<"SMALL" | "MEDIUM" | "LARGE">("SMALL");
  const [description, setDescription] = useState("");
  const [fragile, setFragile] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const place = (p: Point) => {
    setError(null);
    if (stage === "pickup") {
      setPickup(p);
      if (!dropoff) setStage("dropoff");
    } else setDropoff(p);
  };

  const locate = () => {
    if (!navigator.geolocation) return setError(tr.locationDenied);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        place({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setError(tr.locationDenied);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  };

  const km = pickup && dropoff ? Math.round(distanceKm(pickup, dropoff) * 10) / 10 : null;
  const ready = !!pickup && !!dropoff && (kind === "RIDE" || (description.trim().length >= 2 && recipientName.trim().length >= 2 && recipientPhone.trim().length >= 6));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickup || !dropoff) return;
    setError(null);
    const common = { pickup, dropoff, vehicleType: vehicle, note, destinationSlug: destination?.slug, originSlug: origin?.slug };
    const input =
      kind === "RIDE"
        ? { kind, ...common }
        : { kind, ...common, packageSize: size, packageDescription: description, fragile, recipientName, recipientPhone };
    start(async () => {
      const r = await requestTripAction(input);
      if (r.ok) router.push(`/trips/${r.tripId}`);
      else setError(r.error === "forbidden" ? tr.errors.notAllowed : tr.errors[r.error]);
    });
  };

  const center = pickup ?? dropoff ?? DAR_CENTER;
  const markers = [
    ...(pickup && stage !== "pickup" ? [{ id: "pickup", ...pickup, precision: "exact" as const, label: origin?.name ?? tr.pickup }] : []),
    ...(dropoff && stage !== "dropoff" ? [{ id: "dropoff", ...dropoff, precision: "exact" as const, label: destination?.name ?? tr.dropoff }] : []),
  ];

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {/* Which pin the next map tap sets. */}
      <div className="grid grid-cols-2 gap-2">
        {(["pickup", "dropoff"] as const).map((s) => {
          const set = s === "pickup" ? pickup : dropoff;
          const Icon = s === "pickup" ? MapPin : Flag;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              aria-pressed={stage === s}
              className={`flex min-h-14 items-center gap-2 rounded-2xl border px-3 text-left text-sm transition ${stage === s ? "border-link bg-link/5 ring-2 ring-link/30" : "border-line bg-surface"}`}
            >
              <Icon aria-hidden className={`size-5 shrink-0 ${s === "pickup" ? "text-brand-700" : "text-cta"}`} />
              <span className="min-w-0">
                <span className="block text-xs text-ink-muted">{s === "pickup" ? tr.pickup : kind === "DELIVERY" ? tr.deliverTo : tr.dropoff}</span>
                <span className="block truncate font-semibold">
                  {set ? (s === "dropoff" && destination ? destination.name : s === "pickup" && origin ? origin.name : tr.pointSet) : s === "pickup" ? tr.setPickup : tr.setDropoff}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={locate} disabled={locating} className="inline-flex min-h-9 w-fit items-center gap-1.5 text-sm font-semibold text-link">
          <LocateFixed aria-hidden className="size-4" />
          {locating ? tr.locating : tr.useMyLocation}
        </button>
        <p className="text-xs text-ink-muted">{stage === "pickup" ? tr.tapMapPickup : tr.tapMapDropoff}</p>
        <MapView center={center} zoom={pickup || dropoff ? 14 : 12} pin={stage === "pickup" ? pickup : dropoff} onPinChange={place} markers={markers} className="h-72 sm:h-80" />
        {destination && <p className="text-xs text-ink-muted">{fill(tr.goingTo, { name: destination.name })}</p>}
        {origin && <p className="text-xs text-ink-muted">{fill(tr.fromBusiness, { name: origin.name })}</p>}
        {km != null && <p className="text-sm font-semibold">{fill(tr.distance, { km: km.toFixed(1) })}</p>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{tr.vehicle}</legend>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(tr.vehicles) as Vehicle[]).map((v) => {
            const Icon = VEHICLE_ICON[v];
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVehicle(v)}
                aria-pressed={vehicle === v}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-center text-[11px] font-semibold transition sm:text-xs ${vehicle === v ? "border-action bg-action text-white" : "border-line bg-surface text-ink"}`}
              >
                <Icon aria-hidden className="size-5" />
                {tr.vehicles[v]}
              </button>
            );
          })}
        </div>
      </fieldset>

      {kind === "DELIVERY" && (
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <legend className="flex items-center gap-1.5 px-1 text-sm font-bold">
            <Package aria-hidden className="size-4 text-cta" />
            {tr.package}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(tr.sizes) as ("SMALL" | "MEDIUM" | "LARGE")[]).map((s) => (
              <label key={s} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${size === s ? "border-link bg-link/5" : "border-line"}`}>
                <input type="radio" name="size" checked={size === s} onChange={() => setSize(s)} className="accent-[var(--color-link)]" />
                {tr.sizes[s]}
              </label>
            ))}
          </div>
          <Field id="pkg" label={tr.packageDescription}>
            <Input id="pkg" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder={tr.packagePlaceholder} required />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={fragile} onChange={(e) => setFragile(e.target.checked)} className="size-4 accent-[var(--color-cta)]" />
            {tr.fragile}
          </label>
          <p className="mt-1 text-sm font-bold">{tr.recipient}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="rname" label={tr.recipientName}>
              <Input id="rname" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={60} autoComplete="off" required />
            </Field>
            <Field id="rphone" label={tr.recipientPhone}>
              <Input id="rphone" type="tel" inputMode="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} maxLength={20} autoComplete="off" placeholder="07xx xxx xxx" required />
            </Field>
          </div>
        </fieldset>
      )}

      <Field id="note" label={tr.note}>
        <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={tr.notePlaceholder} />
      </Field>

      <p className="rounded-xl bg-canvas p-3 text-xs leading-relaxed text-ink-muted">{tr.fareNote}</p>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="cta" disabled={!ready || pending} className="min-h-12 text-base">
        {pending ? tr.sending : kind === "RIDE" ? tr.submitRide : tr.submitDelivery}
      </Button>
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-subtle">
        <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
        {tr.privacyNote}
      </p>
    </form>
  );
}
