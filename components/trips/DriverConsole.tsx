"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, ChevronRight, Flag, MapPin, Package, Power, ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { Alert, Button, ButtonLink, Card, Field, Input } from "@/components/ui";
import { acceptOfferAction, declineOfferAction, saveDriverProfileAction, setOnlineAction } from "@/lib/actions/trips";
import { formatTzs } from "@/lib/provider/format";

type Vehicle = "BODA" | "BAJAJI" | "CAR" | "VAN";
export type DriverSetup = {
  offersRides: boolean;
  offersDelivery: boolean;
  vehicleType: Vehicle;
  vehicleModel: string;
  vehicleColor: string;
  plateNumber: string;
  baseFare: number;
  perKmFare: number;
};
type Offer = {
  id: string;
  distanceKm: number;
  fare: number | null;
  trip: { id: string; kind: "RIDE" | "DELIVERY"; vehicleType: string; pickupLabel: string; dropoffLabel: string; distanceKm: number; packageSize: string | null; fragile: boolean };
};

const POLL_MS = 5_000;
const PING_MS = 5_000;

/** The driver's screen (Phase 17): vehicle & rates, online switch, live offers. */
export function DriverConsole({ setup, verified, initialOnline, initialOffers, initialActiveTripId }: { setup: DriverSetup | null; verified: boolean; initialOnline: boolean; initialOffers: Offer[]; initialActiveTripId: string | null }) {
  const { t } = useI18n();
  const tr = t.trips;
  const router = useRouter();
  const [online, setOnline] = useState(initialOnline);
  const [offers, setOffers] = useState<Offer[]>(initialOffers);
  const [activeTripId, setActiveTripId] = useState(initialActiveTripId);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lastPing = useRef(0);
  const err = (e: string) => (e === "forbidden" ? tr.errors.notAllowed : (tr.errors as Record<string, string>)[e] ?? tr.errors.invalid);

  // While online: share position (throttled) and fetch offers.
  useEffect(() => {
    if (!online) return;
    let stopped = false;
    const watch = navigator.geolocation?.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPing.current < PING_MS) return;
        lastPing.current = now;
        void fetch("/api/driver/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }) }).then((r) => {
          if (r.status === 409 && !stopped) setOnline(false); // switched off elsewhere
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/driver/offers", { cache: "no-store" });
        if (r.ok && !stopped) {
          const j = (await r.json()) as { offers: Offer[]; activeTripId: string | null };
          setOffers(j.offers);
          setActiveTripId(j.activeTripId);
        }
      } catch {
        // try again next tick
      }
    };
    const id = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
      if (watch != null) navigator.geolocation.clearWatch(watch);
    };
  }, [online]);

  const toggle = useCallback(() => {
    setError(null);
    if (online) {
      start(async () => {
        await setOnlineAction(false);
        setOnline(false);
        setOffers([]);
      });
      return;
    }
    if (!navigator.geolocation) return setError(tr.locationDenied);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        start(async () => {
          const r = await setOnlineAction(true, { lat: pos.coords.latitude, lng: pos.coords.longitude });
          if (r.ok) setOnline(true);
          else setError(err(r.error));
        }),
      () => setError(tr.locationDenied),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const respond = (offer: Offer, accept: boolean) =>
    start(async () => {
      setError(null);
      if (accept) {
        const r = await acceptOfferAction(offer.id);
        if (r.ok) return router.push(`/provider/driver/trips/${r.tripId}`);
        setError(err(r.error));
      } else await declineOfferAction(offer.id);
      setOffers((o) => o.filter((x) => x.id !== offer.id));
    });

  return (
    <div className="flex flex-col gap-5">
      {!verified && (
        <Alert tone="info">
          <span className="flex flex-col gap-2">
            <span className="flex items-center gap-2 font-semibold">
              <ShieldAlert aria-hidden className="size-4" />
              {tr.needVerified}
            </span>
            <Link href="/provider/verification" className="font-bold underline">
              {tr.verifyLink}
            </Link>
          </span>
        </Alert>
      )}

      {setup && verified && (
        <div className={`flex items-center gap-4 rounded-3xl p-5 text-white shadow-lift ${online ? "bg-whatsapp" : "nav-gradient"}`}>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold">{online ? tr.online : tr.offline}</p>
            <p className="mt-0.5 text-xs text-white/80">{tr.onlineHint}</p>
          </div>
          <button type="button" onClick={toggle} disabled={pending} aria-pressed={online} className="flex min-h-12 shrink-0 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-ink shadow-soft active:scale-95 disabled:opacity-60">
            <Power aria-hidden className={`size-4 ${online ? "text-danger" : "text-whatsapp"}`} />
            {online ? tr.goOffline : tr.goOnline}
          </button>
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      {activeTripId && (
        <ButtonLink href={`/provider/driver/trips/${activeTripId}`} variant="cta" className="min-h-14 justify-between text-base">
          {tr.activeTrip}
          <ChevronRight aria-hidden className="size-5" />
        </ButtonLink>
      )}

      {online && (
        <section>
          <h2 className="mb-3 text-lg font-bold">{tr.offers}</h2>
          {offers.length === 0 ? (
            <Card className="text-center text-sm text-ink-muted">{tr.noOffers}</Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {offers.map((o) => {
                const Icon = o.trip.kind === "RIDE" ? Bike : Package;
                return (
                  <li key={o.id}>
                    <Card className="flex flex-col gap-3 p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cta/15 text-cta">
                          <Icon aria-hidden className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="flex items-center gap-1.5 font-bold">
                            <MapPin aria-hidden className="size-3.5 text-brand-700" /> {o.trip.pickupLabel}
                          </p>
                          <p className="flex items-center gap-1.5 font-bold">
                            <Flag aria-hidden className="size-3.5 text-cta" /> {o.trip.dropoffLabel}
                          </p>
                          <p className="mt-1 text-xs text-ink-muted">
                            {fill(tr.offerAway, { km: o.distanceKm.toFixed(1) })} · {fill(tr.tripLength, { km: o.trip.distanceKm.toFixed(1) })}
                            {o.trip.packageSize && ` · ${tr.sizes[o.trip.packageSize as keyof typeof tr.sizes]}`}
                            {o.trip.fragile && ` · ${tr.fragile}`}
                          </p>
                        </div>
                        {o.fare != null && <span className="shrink-0 text-base font-extrabold">{formatTzs(o.fare)}</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" onClick={() => respond(o, false)} disabled={pending}>
                          {tr.decline}
                        </Button>
                        <Button variant="cta" onClick={() => respond(o, true)} disabled={pending || !!activeTripId}>
                          {tr.accept}
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <SetupForm initial={setup} />
    </div>
  );
}

function SetupForm({ initial }: { initial: DriverSetup | null }) {
  const { t } = useI18n();
  const tr = t.trips;
  const router = useRouter();
  const [v, setV] = useState<DriverSetup>(
    initial ?? { offersRides: true, offersDelivery: true, vehicleType: "BODA", vehicleModel: "", vehicleColor: "", plateNumber: "", baseFare: 0, perKmFare: 0 },
  );
  const [open, setOpen] = useState(!initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof DriverSetup>(k: K, val: DriverSetup[K]) => setV((x) => ({ ...x, [k]: val }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveDriverProfileAction(v);
      setMsg(r.ok ? { ok: true, text: tr.saved } : { ok: false, text: r.error === "forbidden" ? tr.errors.notAllowed : tr.errors.invalid });
      if (r.ok) router.refresh();
    });
  };

  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {tr.driverSetup}
      </Button>
    );

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">{tr.driverSetup}</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={v.offersRides} onChange={(e) => set("offersRides", e.target.checked)} className="size-4" />
            {tr.offersRides}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={v.offersDelivery} onChange={(e) => set("offersDelivery", e.target.checked)} className="size-4" />
            {tr.offersDelivery}
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(tr.vehicles) as Vehicle[]).map((k) => (
            <button key={k} type="button" aria-pressed={v.vehicleType === k} onClick={() => set("vehicleType", k)} className={`min-h-11 rounded-xl border px-2 text-sm font-semibold ${v.vehicleType === k ? "border-action bg-action text-white" : "border-line"}`}>
              {tr.vehicles[k]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="vm" label={tr.vehicleModel}>
            <Input id="vm" value={v.vehicleModel} onChange={(e) => set("vehicleModel", e.target.value)} maxLength={40} placeholder={tr.vehicleModelPlaceholder} required />
          </Field>
          <Field id="vc" label={tr.vehicleColor}>
            <Input id="vc" value={v.vehicleColor} onChange={(e) => set("vehicleColor", e.target.value)} maxLength={20} required />
          </Field>
          <Field id="pl" label={tr.plateNumber}>
            <Input id="pl" value={v.plateNumber} onChange={(e) => set("plateNumber", e.target.value.toUpperCase())} maxLength={12} placeholder={tr.platePlaceholder} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="bf" label={tr.baseFare}>
            <Input id="bf" type="number" inputMode="numeric" min={0} step={100} value={v.baseFare || ""} onChange={(e) => set("baseFare", Math.max(0, Math.floor(Number(e.target.value) || 0)))} required />
          </Field>
          <Field id="pk" label={tr.perKmFare}>
            <Input id="pk" type="number" inputMode="numeric" min={0} step={50} value={v.perKmFare || ""} onChange={(e) => set("perKmFare", Math.max(0, Math.floor(Number(e.target.value) || 0)))} required />
          </Field>
        </div>
        <p className="text-xs text-ink-muted">{fill(tr.ratesHint, { example: (Math.round((v.baseFare + v.perKmFare * 10) / 100) * 100).toLocaleString("en-US") })}</p>
        {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
        <Button type="submit" disabled={pending || (!v.offersRides && !v.offersDelivery)}>
          {tr.save}
        </Button>
      </form>
    </Card>
  );
}
