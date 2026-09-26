import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { encryptionConfigured } from "@/lib/crypto/fieldCipher";
import { destinationFor } from "@/lib/services/trips";
import { TripRequestForm } from "@/components/trips/TripRequestForm";
import { Alert } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trips.delivery };
}

/** Phase 17: request a delivery (optionally from a business to the customer: ?from=<slug>). */
export default async function DeliveryPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requirePageAccess("trips:request", "/delivery");
  const { t } = await getServerDictionary();
  const { from } = await searchParams;
  const origin = from && /^[a-z0-9-]{1,80}$/.test(from) ? await destinationFor(from) : null;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{origin ? t.trips.deliverToMe : t.trips.delivery}</h1>
      <p className="mt-1 mb-5 text-sm text-ink-muted">{origin ? t.trips.deliverToMeHint : t.trips.deliveryTagline}</p>
      {encryptionConfigured() ? (
        <TripRequestForm kind="DELIVERY" origin={origin ? { slug: from!, name: origin.name, point: origin.point } : null} />
      ) : (
        <Alert tone="info">{t.trips.unavailable}</Alert>
      )}
    </div>
  );
}
