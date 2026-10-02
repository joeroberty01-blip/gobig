import Link from "next/link";
import type { Metadata } from "next";
import { AlertCircle, ChevronRight } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getOverviewCounts } from "@/lib/data/admin";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.admin.overviewTitle };
}

/** Admin home (Phase 12): what needs attention, key numbers, and every management area. */
export default async function AdminOverviewPage() {
  await requirePageAccess("admin-area:access", "/admin");
  const [{ t }, counts, openReports, pendingPayments, requestedCampaigns] = await Promise.all([
    getServerDictionary(),
    getOverviewCounts(),
    prisma.report.count({ where: { status: "OPEN" } }),
    Promise.all([
      prisma.subscription.count({ where: { status: "PENDING_PAYMENT" } }),
      prisma.featuredCampaign.count({ where: { status: "PENDING_PAYMENT" } }),
    ]).then(([a, b]) => a + b),
    prisma.featuredCampaign.count({ where: { status: "REQUESTED" } }),
  ]);
  const d = t.adminPlatform.dashboard;
  const L = d.links;

  const attention = [
    { label: d.pendingVerification, value: counts.pendingVerifications, href: "/admin/verification" },
    { label: d.openReports, value: openReports, href: "/admin/reports" },
    { label: d.openReviewReports, value: counts.openReports, href: "/admin/reviews" },
    { label: d.pendingPayments, value: pendingPayments, href: "/admin/monetization" },
    { label: d.requestedCampaigns, value: requestedCampaigns, href: "/admin/monetization#campaigns" },
  ].filter((a) => a.value > 0);

  const tiles = [
    { label: t.admin.customers, value: counts.customers, href: "/admin/users?role=CUSTOMER" },
    { label: t.admin.providers, value: counts.providers, href: "/admin/providers" },
    { label: t.admin.services, value: counts.services, href: "/admin/categories" },
    { label: t.admin.locations, value: counts.locations, href: "/admin/locations" },
  ];

  const groups = [
    { title: d.people, links: [[L.users, "/admin/users"], [L.providers, "/admin/providers"]] },
    { title: d.catalogue, links: [[L.categories, "/admin/categories"], [L.locations, "/admin/locations"]] },
    { title: d.activity, links: [[L.verification, "/admin/verification"], [L.reviews, "/admin/reviews"], [L.requests, "/admin/requests"], [L.reports, "/admin/reports"], [L.risk, "/admin/risk"]] },
    { title: d.platform, links: [[L.monetization, "/admin/monetization"], [L.analytics, "/admin/analytics"], [L.announcements, "/admin/announcements"], [L.audit, "/admin/audit"], [L.ranking, "/admin/ranking"], [L.settings, "/admin/settings"]] },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title={t.admin.overviewTitle} />

      <section aria-labelledby="attention">
        <h2 id="attention" className="mb-2 text-sm font-semibold text-ink-muted">
          {d.attention}
        </h2>
        {attention.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-ink-muted">{d.nothing}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((a) => (
              <li key={a.href + a.label}>
                <Link href={a.href} className="flex items-center gap-3 rounded-2xl border border-accent-500 bg-accent-400/10 p-4 hover:bg-accent-400/20">
                  <AlertCircle aria-hidden className="size-5 shrink-0 text-accent-500" />
                  <span className="flex-1 font-semibold">{a.label}</span>
                  <span className="text-2xl font-bold tabular-nums">{a.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-brand-500">
            <div className="text-3xl font-bold tabular-nums">{tile.value.toLocaleString("en-US")}</div>
            <div className="mt-1 text-sm text-ink-muted">{tile.label}</div>
          </Link>
        ))}
      </div>

      <section aria-labelledby="manage">
        <h2 id="manage" className="mb-2 text-sm font-semibold text-ink-muted">
          {d.sections}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title} className="rounded-2xl border border-line bg-surface p-2">
              <h3 className="px-3 pt-2 pb-1 text-xs font-semibold text-ink-subtle uppercase">{g.title}</h3>
              <ul>
                {g.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="flex min-h-11 items-center justify-between rounded-xl px-3 font-medium hover:bg-canvas">
                      {label}
                      <ChevronRight aria-hidden className="size-4 text-ink-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
