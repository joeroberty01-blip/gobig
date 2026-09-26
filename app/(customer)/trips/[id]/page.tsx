import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { tripForCustomer } from "@/lib/services/trips";
import { TripLive } from "@/components/trips/TripLive";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trips.myTrips };
}

/** Phase 17: one of the customer's own trips (404 for anyone else's). */
export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageAccess("trips:request", `/trips/${id}`);
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();
  const trip = await tripForCustomer(user.id, id);
  if (!trip) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <TripLive initial={trip} />
    </div>
  );
}
