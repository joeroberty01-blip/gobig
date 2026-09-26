import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { tripForDriver } from "@/lib/services/trips";
import { DriverTrip } from "@/components/trips/DriverTrip";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trips.activeTrip };
}

/** Phase 17: a trip offered to, or driven by, this provider (404 otherwise). */
export default async function DriverTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageAccess("trips:drive", `/provider/driver/trips/${id}`);
  const providerId = await getOwnedProviderId(user.id);
  if (!providerId) redirect("/provider");
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();
  const trip = await tripForDriver(providerId, id);
  if (!trip) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <DriverTrip initial={trip} />
    </div>
  );
}
