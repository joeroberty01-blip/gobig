import type { Metadata } from "next";
import Link from "next/link";
import { Bike, ChevronRight, Package, Star } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { listCustomerTrips } from "@/lib/services/trips";
import { formatTzs } from "@/lib/provider/format";
import { ButtonLink, EmptyState } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trips.myTrips };
}

const TONE: Record<string, string> = {
  REQUESTED: "bg-link/10 text-link",
  ACCEPTED: "bg-link/10 text-link",
  ARRIVED: "bg-link/10 text-link",
  IN_PROGRESS: "bg-cta/15 text-cta",
  COMPLETED: "bg-success-soft text-success",
  CANCELLED: "bg-canvas text-ink-muted",
  EXPIRED: "bg-canvas text-ink-muted",
};

/** Phase 17: the customer's rides and deliveries. */
export default async function TripsPage() {
  const user = await requirePageAccess("trips:request", "/trips");
  const { t, locale } = await getServerDictionary();
  const tr = t.trips;
  const rows = await listCustomerTrips(user.id);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{tr.myTrips}</h1>
        <div className="flex gap-2">
          <ButtonLink href="/ride" variant="cta" className="min-h-10">
            <Bike aria-hidden className="size-4" />
            {tr.rideShort}
          </ButtonLink>
          <ButtonLink href="/delivery" variant="primary" className="min-h-10">
            <Package aria-hidden className="size-4" />
            {tr.deliveryShort}
          </ButtonLink>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Bike />} title={tr.noTrips} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => {
            const Icon = r.kind === "RIDE" ? Bike : Package;
            const status = (r.kind === "DELIVERY" ? tr.statusDelivery : tr.status)[r.status as keyof typeof tr.status];
            const fare = r.fareFinal ?? r.fareEstimate;
            return (
              <li key={r.id}>
                <Link href={`/trips/${r.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-soft transition hover:shadow-lift">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas">
                    <Icon aria-hidden className="size-5 text-ink" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {r.pickupLabel} → {r.dropoffLabel}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {date.format(r.createdAt)} · {fill(tr.distance, { km: r.distanceKm.toFixed(1) })}
                      {r.driver?.profile?.displayName && ` · ${r.driver.profile.displayName}`}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[r.status] ?? ""}`}>{status}</span>
                      {r.rating && (
                        <span className="flex items-center gap-0.5 text-xs text-ink-muted">
                          <Star aria-hidden className="size-3 fill-accent-400 text-accent-500" />
                          {r.rating}
                        </span>
                      )}
                    </span>
                  </span>
                  {fare != null && <span className="shrink-0 text-sm font-bold">{formatTzs(fare)}</span>}
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
