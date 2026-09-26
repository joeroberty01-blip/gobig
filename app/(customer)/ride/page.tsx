import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { encryptionConfigured } from "@/lib/crypto/fieldCipher";
import { TripRequestForm } from "@/components/trips/TripRequestForm";
import { Alert } from "@/components/ui";
import { destinationFor } from "@/lib/services/trips";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trips.ride };
}

/** Phase 17: request a ride (optionally to a business: ?to=<slug>). */
export default async function RidePage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  await requirePageAccess("trips:request", "/ride");
  const { t } = await getServerDictionary();
  const { to } = await searchParams;
  const destination = to && /^[a-z0-9-]{1,80}$/.test(to) ? await destinationFor(to) : null;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t.trips.ride}</h1>
      <p className="mt-1 mb-5 text-sm text-ink-muted">{t.trips.rideTagline}</p>
      {encryptionConfigured() ? <TripRequestForm kind="RIDE" destination={destination ? { slug: to!, name: destination.name, point: destination.point } : null} /> : <Alert tone="info">{t.trips.unavailable}</Alert>}
    </div>
  );
}
