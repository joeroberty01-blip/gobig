import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { encryptionConfigured } from "@/lib/crypto/fieldCipher";
import { TripRequestForm } from "@/components/trips/TripRequestForm";
import { Alert } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trips.delivery };
}

/** Phase 17: request a delivery. */
export default async function DeliveryPage() {
  await requirePageAccess("trips:request", "/delivery");
  const { t } = await getServerDictionary();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t.trips.delivery}</h1>
      <p className="mt-1 mb-5 text-sm text-ink-muted">{t.trips.deliveryTagline}</p>
      {encryptionConfigured() ? <TripRequestForm kind="DELIVERY" /> : <Alert tone="info">{t.trips.unavailable}</Alert>}
    </div>
  );
}
