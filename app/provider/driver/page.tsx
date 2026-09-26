import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bike, Package, Star } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { driverActiveTrip, getDriverProfile, listDriverOffers, listDriverTrips } from "@/lib/services/trips";
import { encryptionConfigured } from "@/lib/crypto/fieldCipher";
import { formatTzs } from "@/lib/provider/format";
import { DriverConsole } from "@/components/trips/DriverConsole";
import { Alert } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trips.driverTitle };
}

/** Phase 17: the provider's driver console (vehicle & rates, online switch, offers, history). */
export default async function DriverPage() {
  const user = await requirePageAccess("trips:drive", "/provider/driver");
  const providerId = await getOwnedProviderId(user.id);
  if (!providerId) redirect("/provider");
  const { t, locale } = await getServerDictionary();
  const tr = t.trips;
  const [driver, provider, offers, active, recent] = await Promise.all([
    getDriverProfile(providerId),
    prisma.provider.findUnique({ where: { id: providerId }, select: { verificationLevelId: true, status: true, isDemo: true } }),
    listDriverOffers(providerId),
    driverActiveTrip(providerId),
    listDriverTrips(providerId, 15),
  ]);
  const verified = !!provider?.verificationLevelId && provider.status === "ACTIVE" && !provider.isDemo;
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{tr.driverTitle}</h1>
      <p className="mt-1 mb-5 text-sm text-ink-muted">{tr.driverIntro}</p>
      {driver?.ratingCount ? (
        <p className="-mt-3 mb-5 flex items-center gap-1 text-sm">
          <Star aria-hidden className="size-4 fill-accent-400 text-accent-500" />
          <b>{driver.ratingAvg?.toFixed(1)}</b> <span className="text-ink-muted">({driver.ratingCount})</span>
        </p>
      ) : null}
      {!encryptionConfigured() ? (
        <Alert tone="info">{tr.unavailable}</Alert>
      ) : (
        <DriverConsole
          setup={driver ? { offersRides: driver.offersRides, offersDelivery: driver.offersDelivery, vehicleType: driver.vehicleType, vehicleModel: driver.vehicleModel, vehicleColor: driver.vehicleColor, plateNumber: driver.plateNumber, baseFare: driver.baseFare, perKmFare: driver.perKmFare } : null}
          verified={verified}
          initialOnline={!!driver?.online}
          initialOffers={driver?.online ? offers : []}
          initialActiveTripId={active?.id ?? null}
        />
      )}

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{tr.recentTrips}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {recent.map((r) => {
              const Icon = r.kind === "RIDE" ? Bike : Package;
              return (
                <li key={r.id}>
                  <Link href={`/provider/driver/trips/${r.id}`} className="flex items-center gap-3 p-3.5 hover:bg-canvas">
                    <Icon aria-hidden className="size-5 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-semibold">
                        {r.pickupLabel} → {r.dropoffLabel}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {date.format(r.createdAt)} · {(r.kind === "DELIVERY" ? tr.statusDelivery : tr.status)[r.status as keyof typeof tr.status]}
                        {r.rating ? ` · ${fill(tr.stars, { n: r.rating })}` : ""}
                      </span>
                    </span>
                    {r.fareFinal != null && <b className="text-sm">{formatTzs(r.fareFinal)}</b>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
