"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Flag, KeyRound, Loader2, MapPin, Package, Phone, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { MapView } from "@/components/map/MapView";
import { Alert, Button, ButtonLink, Card } from "@/components/ui";
import { cancelTripAction, rateTripAction } from "@/lib/actions/trips";
import { formatTzs } from "@/lib/provider/format";
import type { CustomerTrip } from "@/lib/services/trips";

const LIVE = ["REQUESTED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"];
const POLL_MS = 5_000;

/** The customer's trip screen (Phase 17): refreshes itself every few seconds while the trip is live. */
export function TripLive({ initial }: { initial: CustomerTrip }) {
  const { t, locale } = useI18n();
  const tr = t.trips;
  const [trip, setTrip] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const live = LIVE.includes(trip.status);

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/trips/${trip.id}`, { cache: "no-store" });
        if (res.ok && !stopped) setTrip(await res.json());
      } catch {
        // Offline for a moment: the next tick tries again.
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [live, trip.id]);

  const statusText = (trip.kind === "DELIVERY" ? tr.statusDelivery : tr.status)[trip.status as keyof typeof tr.status];
  const d = trip.driver;
  const time = (v: string | Date | null | undefined) =>
    v ? new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" }).format(new Date(v)) : "";

  const cancel = () => {
    if (!window.confirm(tr.cancelConfirm)) return;
    start(async () => {
      const r = await cancelTripAction(trip.id);
      if (r.ok) setTrip({ ...trip, status: "CANCELLED", cancelledBy: "CUSTOMER" });
      else setError(r.error === "forbidden" ? tr.errors.notAllowed : tr.errors[r.error]);
    });
  };

  const markers = [
    ...(trip.pickup ? [{ id: "p", ...trip.pickup, precision: "exact" as const, label: tr.pickup }] : []),
    ...(trip.dropoff ? [{ id: "d", ...trip.dropoff, precision: "exact" as const, label: trip.dropoffLabel }] : []),
    ...(d?.position ? [{ id: "driver", lat: d.position.lat, lng: d.position.lng, precision: "exact" as const, label: d.name, sublabel: d.vehicle?.plate }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Status header */}
      <div className="overflow-hidden rounded-3xl nav-gradient p-5 text-white shadow-lift">
        <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">{trip.kind === "RIDE" ? tr.rideShort : tr.deliveryShort}</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          {live && trip.status === "REQUESTED" && <Loader2 aria-hidden className="size-6 animate-spin" />}
          {statusText}
        </h1>
        <ol className="mt-4 flex flex-col gap-2 text-sm">
          <li className="flex items-center gap-2">
            <MapPin aria-hidden className="size-4 shrink-0 text-emerald-300" />
            <span className="truncate">{trip.pickupLabel}</span>
          </li>
          <li className="flex items-center gap-2">
            <Flag aria-hidden className="size-4 shrink-0 text-cta" />
            <span className="truncate">{trip.dropoffLabel}</span>
            <span className="ml-auto shrink-0 text-white/60">{fill(tr.distance, { km: trip.distanceKm.toFixed(1) })}</span>
          </li>
        </ol>
      </div>

      {trip.status === "REQUESTED" && (
        <Card className="text-center">
          <p className="font-semibold">{tr.searching}</p>
          <p className="mt-1 text-sm text-ink-muted">{tr.searchingHint}</p>
        </Card>
      )}
      {trip.status === "EXPIRED" && (
        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-ink-muted">{tr.expiredHint}</p>
          <ButtonLink href={trip.kind === "RIDE" ? "/ride" : "/delivery"} variant="cta">
            {tr.tryAgain}
          </ButtonLink>
        </Card>
      )}
      {trip.status === "CANCELLED" && trip.cancelledBy && <Alert tone="info">{tr.cancelledBy[trip.cancelledBy as keyof typeof tr.cancelledBy]}</Alert>}

      {/* Driver */}
      {d && (
        <Card className="flex flex-col gap-4">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{trip.kind === "RIDE" ? tr.yourDriver : tr.yourRider}</p>
          <div className="flex items-center gap-3">
            <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-hero text-xl font-bold text-white">
              {d.logoUrl ? <Image src={d.logoUrl} alt="" fill sizes="56px" className="object-cover" /> : d.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/p/${d.slug}`} className="flex items-center gap-1 truncate font-bold">
                {d.name}
                {d.verified && <BadgeCheck aria-label={t.ui.home.verified} className="size-4 shrink-0 fill-link text-white" />}
              </Link>
              <p className="flex items-center gap-1 text-sm text-ink-muted">
                {d.rating?.count ? (
                  <>
                    <Star aria-hidden className="size-3.5 fill-accent-400 text-accent-500" />
                    <b className="text-ink">{d.rating.avg?.toFixed(1)}</b> ({d.rating.count})
                  </>
                ) : (
                  tr.noRatings
                )}
              </p>
              {d.vehicle && (
                <p className="text-sm text-ink-muted">
                  {tr.vehicles[d.vehicle.type as keyof typeof tr.vehicles]} · {d.vehicle.model} · {d.vehicle.color} · <b className="text-ink">{d.vehicle.plate}</b>
                </p>
              )}
            </div>
            {d.phone && (
              <a href={`tel:+${d.phone}`} aria-label={tr.call} className="grid size-12 shrink-0 place-items-center rounded-full bg-whatsapp text-white shadow-soft">
                <Phone aria-hidden className="size-5" />
              </a>
            )}
          </div>
          {trip.fareEstimate != null && trip.status !== "COMPLETED" && (
            <p className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2 text-sm">
              {tr.fareEstimate}
              <b>{formatTzs(trip.fareEstimate)}</b>
            </p>
          )}
        </Card>
      )}

      {/* PIN / handover code */}
      {trip.code && (
        <Card className="flex items-center gap-4 border-cta/30 bg-cta/5">
          <KeyRound aria-hidden className="size-8 shrink-0 text-cta" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{trip.kind === "RIDE" ? tr.pinTitle : tr.codeTitle}</p>
            <p className="text-xs text-ink-muted">{trip.kind === "RIDE" ? tr.pinHint : fill(tr.codeHint, { name: trip.recipientName ?? "" })}</p>
          </div>
          <span className="rounded-xl bg-surface px-3 py-2 font-mono text-2xl font-black tracking-[0.2em]">{trip.code}</span>
        </Card>
      )}

      {live && markers.length > 0 && (
        <div className="flex flex-col gap-1">
          <MapView center={d?.position ?? trip.pickup ?? markers[0]!} zoom={14} markers={markers} fitToMarkers className="h-72" />
          {d?.position && (
            <p className="text-xs text-ink-subtle">
              {tr.liveHint} {d.position.at && fill(tr.lastSeen, { time: time(d.position.at) })}
            </p>
          )}
        </div>
      )}

      {trip.kind === "DELIVERY" && trip.packageDescription && (
        <Card className="flex items-start gap-3 text-sm">
          <Package aria-hidden className="mt-0.5 size-5 shrink-0 text-cta" />
          <div>
            <p className="font-semibold">{trip.packageDescription}</p>
            <p className="text-ink-muted">
              {trip.packageSize && tr.sizes[trip.packageSize as keyof typeof tr.sizes]}
              {trip.fragile && ` · ${tr.fragile}`}
            </p>
            {trip.recipientName && (
              <p className="mt-1 text-ink-muted">
                {tr.recipient}: <b className="text-ink">{trip.recipientName}</b>
              </p>
            )}
          </div>
        </Card>
      )}

      {trip.status === "COMPLETED" && (
        <Card className="flex flex-col gap-3">
          {trip.fareFinal != null && (
            <p className="flex items-center justify-between text-sm">
              <span>
                {tr.fareFinal}
                {trip.paymentMethod && <span className="block text-xs text-ink-muted">{fill(tr.paidBy, { method: tr.methods[trip.paymentMethod as keyof typeof tr.methods] ?? trip.paymentMethod })}</span>}
              </span>
              <b className="text-lg">{formatTzs(trip.fareFinal)}</b>
            </p>
          )}
          {trip.rating ? (
            <div>
              <p className="text-sm font-semibold">{tr.yourRating}</p>
              <Stars value={trip.rating} label={fill(tr.stars, { n: trip.rating })} />
              {trip.ratingComment && <p className="mt-1 text-sm text-ink-muted">“{trip.ratingComment}”</p>}
            </div>
          ) : d ? (
            <RateForm tripId={trip.id} driverName={d.name} onDone={(rating, comment) => setTrip({ ...trip, rating, ratingComment: comment || null })} />
          ) : null}
        </Card>
      )}

      {error && <Alert>{error}</Alert>}
      {["REQUESTED", "ACCEPTED", "ARRIVED"].includes(trip.status) && (
        <Button variant="secondary" onClick={cancel} disabled={pending} className="text-danger">
          {tr.cancel}
        </Button>
      )}
    </div>
  );
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={`size-5 ${n <= value ? "fill-accent-400 text-accent-500" : "text-line"}`} />
      ))}
    </span>
  );
}

function RateForm({ tripId, driverName, onDone }: { tripId: string; driverName: string; onDone: (rating: number, comment: string) => void }) {
  const { t } = useI18n();
  const tr = t.trips;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = () =>
    start(async () => {
      const r = await rateTripAction(tripId, { rating, comment });
      if (r.ok) onDone(rating, comment);
      else setError(r.error === "forbidden" ? tr.errors.notAllowed : tr.errors[r.error]);
    });
  return (
    <div className="flex flex-col gap-3">
      <p className="font-bold">{tr.rateTitle}</p>
      <p className="text-sm text-ink-muted">{fill(tr.rateDriver, { name: driverName })}</p>
      <div role="radiogroup" aria-label={tr.rateTitle} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={fill(tr.stars, { n })} onClick={() => setRating(n)} className="grid size-11 place-items-center rounded-xl transition active:scale-90">
            <Star aria-hidden className={`size-8 ${n <= rating ? "fill-accent-400 text-accent-500" : "text-line"}`} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={2}
        aria-label={tr.ratingComment}
        placeholder={tr.ratingComment}
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base"
      />
      {error && <Alert>{error}</Alert>}
      <Button onClick={submit} disabled={!rating || pending} variant="cta">
        {tr.submitRating}
      </Button>
    </div>
  );
}
