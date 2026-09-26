import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatTzs } from "@/lib/provider/format";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trips.adminTitle };
}

/** Phase 17: trips overview for admins. Area labels only — exact points are never read here. */
export default async function AdminTripsPage() {
  await requirePageAccess("trips:oversee", "/admin/trips");
  const { t, locale } = await getServerDictionary();
  const tr = t.trips;
  const startOfDay = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" }) + "T00:00:00+03:00");
  const [online, active, today, rows] = await Promise.all([
    prisma.driverProfile.count({ where: { online: true } }),
    prisma.trip.count({ where: { status: { in: ["REQUESTED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"] } } }),
    prisma.trip.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.trip.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, kind: true, status: true, pickupLabel: true, dropoffLabel: true, distanceKm: true, fareFinal: true, paymentMethod: true, rating: true, createdAt: true, driver: { select: { profile: { select: { displayName: true } } } } },
    }),
  ]);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div>
      <PageHeader title={tr.adminTitle} subtitle={tr.adminIntro} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          [tr.adminOnline, online],
          [tr.adminActive, active],
          [tr.adminToday, today],
        ].map(([label, n]) => (
          <Card key={String(label)} className="p-4">
            <p className="text-2xl font-extrabold">{n}</p>
            <p className="text-xs text-ink-muted">{label}</p>
          </Card>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3 whitespace-nowrap text-ink-muted">{date.format(r.createdAt)}</td>
                <td className="p-3">{r.kind === "RIDE" ? tr.rideShort : tr.deliveryShort}</td>
                <td className="p-3">
                  {r.pickupLabel} → {r.dropoffLabel} <span className="text-ink-muted">({fill(tr.distance, { km: r.distanceKm.toFixed(1) })})</span>
                </td>
                <td className="p-3">{r.driver?.profile?.displayName ?? "—"}</td>
                <td className="p-3">{(r.kind === "DELIVERY" ? tr.statusDelivery : tr.status)[r.status as keyof typeof tr.status]}</td>
                <td className="p-3 whitespace-nowrap">
                  {r.fareFinal != null ? formatTzs(r.fareFinal) : "—"}
                  {r.paymentMethod && <span className="block text-xs text-ink-muted">{tr.methods[r.paymentMethod as keyof typeof tr.methods] ?? r.paymentMethod}</span>}
                </td>
                <td className="p-3">{r.rating ? `${r.rating}★` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
