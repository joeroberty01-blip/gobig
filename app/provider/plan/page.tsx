import type { Metadata } from "next";
import { Check, Megaphone } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { getSettings, listPlans, providerBilling } from "@/lib/services/billing";
import { formatTzs } from "@/lib/provider/format";
import { darToday } from "@/lib/validators/requests";
import { CampaignRequestForm, CancelPlanRequestButton, ChoosePlanButton } from "@/components/monetization/ProviderBillingForms";
import { Alert, ButtonLink, Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.billing.provider.title };
}

export default async function ProviderPlanPage() {
  const user = await requirePageAccess("billing:manage-own", "/provider/plan");
  const { t, locale } = await getServerDictionary();
  const b = t.billing.provider;
  const providerId = await getOwnedProviderId(user.id);
  if (!providerId) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={b.title} />
        <Card className="flex flex-col items-start gap-3 text-sm text-ink-muted">
          {t.insights.noBusiness}
          <ButtonLink href="/provider/setup/name">{t.profile.dashboard.start}</ButtonLink>
        </Card>
      </div>
    );
  }

  const [info, plans, settings, provider, areas] = await Promise.all([
    providerBilling(providerId),
    listPlans({ activeOnly: true }),
    getSettings(),
    prisma.provider.findUnique({
      where: { id: providerId },
      select: {
        services: { select: { service: { select: { id: true, nameEn: true, nameSw: true, category: { select: { id: true, nameEn: true, nameSw: true, parent: { select: { id: true, nameEn: true, nameSw: true } } } } } } } },
      },
    }),
    prisma.location.findMany({ where: { isActive: true, type: { in: ["DISTRICT", "WARD", "NEIGHBOURHOOD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true } }),
  ]);
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "Africa/Dar_es_Salaam" });
  const day = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "UTC" });
  const instructions = locale === "sw" ? settings.paymentInstructionsSw : settings.paymentInstructionsEn;
  const pending = info.open?.effective === "PENDING_PAYMENT" ? info.open : null;
  const services = provider?.services.map((s) => s.service) ?? [];
  const categories = [...new Map(services.flatMap((s) => [s.category, ...(s.category.parent ? [s.category.parent] : [])]).map((c) => [c.id, c])).values()];

  const features = (p: (typeof plans)[number]) =>
    [
      fill(b.gallery, { n: p.galleryLimit }),
      settings.paidLeadsEnabled && p.leadsPerMonth != null ? fill(b.leadsLimit, { n: p.leadsPerMonth }) : b.leadsUnlimited,
      p.priorityVerificationReview ? b.priority : null,
      p.allowsCampaigns ? b.campaigns : null,
      p.code === "FEATURED" ? b.sponsoredPlan : null,
    ].filter((x): x is string => !!x);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title={b.title} subtitle={b.intro} />

      <Card>
        <p className="text-sm text-ink-muted">{b.current}</p>
        <p className="text-2xl font-semibold">{info.plan ? name(info.plan) : "—"}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {info.active?.currentPeriodEnd ? fill(b.renews, { date: date.format(info.active.currentPeriodEnd) }) : b.free}
        </p>
        {info.leads.limit != null && <p className="mt-1 text-sm text-ink-muted">{fill(b.leadsUsed, { used: info.leads.used, limit: info.leads.limit })}</p>}
      </Card>

      {pending && (
        <Card className="flex flex-col gap-3 border-accent-500">
          <p className="font-semibold">{b.pending}</p>
          <p className="text-sm text-ink-muted">{fill(b.pendingBody, { plan: name(pending.plan), price: formatTzs(pending.priceTzs) })}</p>
          <div className="rounded-xl bg-canvas p-3 text-sm">
            <p className="mb-1 font-medium">{b.howToPay}</p>
            <p className="whitespace-pre-line text-ink-muted">{instructions ?? b.noInstructions}</p>
            <p className="mt-2 text-xs text-ink-subtle">{b.reference}</p>
          </div>
          <CancelPlanRequestButton />
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = info.plan?.id === p.id;
          return (
            <Card key={p.id} className={`flex flex-col gap-3 ${isCurrent ? "border-brand-500" : ""}`}>
              <div>
                <p className="font-semibold">{name(p)}</p>
                <p className="text-sm text-ink-muted">
                  {p.code === "FREE" ? b.free : p.priceTzs == null ? b.notPriced : fill(b.perPeriod, { price: formatTzs(p.priceTzs), days: p.periodDays })}
                </p>
              </div>
              <p className="text-sm text-ink-muted">{locale === "sw" ? p.descriptionSw : p.descriptionEn}</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {features(p).map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {p.code !== "FREE" && !isCurrent && (
                  <ChoosePlanButton planId={p.id} planName={name(p)} disabled={p.priceTzs == null || !!info.open} />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <h2 className="flex items-center gap-2 font-semibold">
          <Megaphone aria-hidden className="size-4 text-accent-500" />
          {b.campaignsTitle}
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">{b.campaignsIntro}</p>
        {info.plan?.allowsCampaigns ? (
          <CampaignRequestForm
            services={services}
            categories={categories}
            // Districts and wards can share a name (Temeke, Ubungo): districts read "All of …".
            areas={areas.map((x) => ({ id: x.id, name: x.type === "DISTRICT" ? fill(t.profile.fields.wholeDistrict, { district: x.name }) : x.name }))}
            today={darToday().toISOString().slice(0, 10)} />
        ) : (
          <Alert tone="info">{b.campaignsLocked}</Alert>
        )}
        {info.campaigns.length > 0 && (
          <ul className="mt-5 divide-y divide-line text-sm">
            {info.campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {c.kind === "FEATURED_SEARCH" ? b.kindFEATURED_SEARCH : b.kindSPONSORED_CATEGORY}
                  {c.service ? ` · ${name(c.service)}` : c.category ? ` · ${name(c.category)}` : ""}
                  {c.location ? ` · ${c.location.name}` : ""}
                  <span className="text-ink-subtle"> · {day.format(c.startsAt)} – {day.format(c.endsAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {c.note?.startsWith("plan:") ? (
                    <span className="text-xs text-ink-subtle">{b.planCampaign}</span>
                  ) : (
                    c.priceTzs != null && <span className="text-xs text-ink-muted">{formatTzs(c.priceTzs)}</span>
                  )}
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold">{b.campaignStatus[c.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">{b.payments}</h2>
        {info.payments.length === 0 ? (
          <p className="text-sm text-ink-muted">{b.noPayments}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {info.payments.map((p) => (
              <li key={p.id} className={`flex flex-wrap justify-between gap-2 py-2 ${p.status === "VOIDED" ? "text-ink-subtle line-through" : ""}`}>
                <span>
                  {day.format(p.paidAt)} · {t.billing.admin.methods[p.method]} · {p.reference}
                </span>
                <span className="font-semibold tabular-nums">{formatTzs(p.amountTzs)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
