import type { Metadata } from "next";
import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { adminCampaigns, adminSubscriptions, getSettings, instructionsLastChanged, listPlans } from "@/lib/services/billing";
import { formatTzs } from "@/lib/provider/format";
import { fill } from "@/lib/i18n/dictionaries";
import { darToday } from "@/lib/validators/requests";
import { CampaignControls, PaymentForm, PlanEditor, ReasonButton, SettingsForm } from "@/components/monetization/AdminBillingForms";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.billing.admin.title };
}

export default async function AdminMonetizationPage() {
  const user = await requirePageAccess("billing:manage", "/admin/monetization");
  const { t, locale } = await getServerDictionary();
  const a = t.billing.admin;
  const canConfigure = can(user, "billing:configure");
  const [plans, settings, subs, campaigns, changed] = await Promise.all([listPlans(), getSettings(), adminSubscriptions(), adminCampaigns(), instructionsLastChanged()]);
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "Africa/Dar_es_Salaam" });
  const day = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "UTC" });
  const today = darToday().toISOString().slice(0, 10);

  const Payments = ({ list }: { list: { id: string; amountTzs: number; method: keyof typeof a.methods; reference: string; paidAt: Date; status: string }[] }) =>
    list.length ? (
      <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-muted">
        {list.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2">
            <span className={p.status === "VOIDED" ? "line-through" : ""}>
              {day.format(p.paidAt)} · {formatTzs(p.amountTzs)} · {a.methods[p.method]} · {p.reference}
            </span>
            {p.status === "VOIDED" ? <span className="text-danger">{a.voided}</span> : <ReasonButton kind="voidPayment" id={p.id} />}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title={a.title} subtitle={a.plansIntro} />

      <section aria-labelledby="subs">
        <h2 id="subs" className="mb-2 font-semibold">
          {a.subscriptions}
        </h2>
        {subs.length === 0 ? (
          <Card className="text-sm text-ink-muted">{a.noSubscriptions}</Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {subs.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <Link href={`/p/${s.provider.slug}`} className="font-semibold hover:underline">
                        {s.provider.profile?.displayName ?? s.provider.slug}
                      </Link>
                      <span className="text-ink-muted"> · {name(s.plan)} · {formatTzs(s.priceTzs)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold">{a.subscriptionStatus[s.effective]}</span>
                      {s.currentPeriodEnd && (
                        <span className="text-xs text-ink-muted">
                          {a.period_}: {date.format(s.currentPeriodEnd)}
                        </span>
                      )}
                      {["PENDING_PAYMENT", "ACTIVE", "PAST_DUE"].includes(s.status) && <ReasonButton kind="cancelSubscription" id={s.id} />}
                    </span>
                  </div>
                  {["PENDING_PAYMENT", "ACTIVE", "PAST_DUE"].includes(s.status) && <PaymentForm kind="subscription" targetId={s.id} amount={s.priceTzs} today={today} />}
                  <Payments list={s.payments} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="campaigns">
        <h2 id="campaigns" className="mb-2 font-semibold">
          {a.campaignsTitle}
        </h2>
        {campaigns.length === 0 ? (
          <Card className="text-sm text-ink-muted">{a.noCampaigns}</Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <Link href={`/p/${c.provider.slug}`} className="font-semibold hover:underline">
                        {c.provider.profile?.displayName ?? c.provider.slug}
                      </Link>
                      <span className="text-ink-muted">
                        {" "}
                        · {c.kind === "FEATURED_SEARCH" ? t.billing.provider.kindFEATURED_SEARCH : t.billing.provider.kindSPONSORED_CATEGORY}
                        {c.service ? ` · ${name(c.service)}` : c.category ? ` · ${name(c.category)}` : ""}
                        {c.location ? ` · ${c.location.name}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-ink-muted">
                        {day.format(c.startsAt)} – {day.format(c.endsAt)}
                        {c.priceTzs != null && !c.note?.startsWith("plan:") ? ` · ${formatTzs(c.priceTzs)}` : ""}
                      </span>
                      <span className="rounded-full bg-canvas px-2 py-0.5 font-semibold">{t.billing.provider.campaignStatus[c.status]}</span>
                    </span>
                  </div>
                  {c.note?.startsWith("plan:") ? (
                    <p className="text-xs text-ink-subtle">{t.billing.provider.planCampaign}</p>
                  ) : (
                    <>
                      <CampaignControls campaignId={c.id} status={c.status} />
                      {c.status === "PENDING_PAYMENT" && <PaymentForm kind="campaign" targetId={c.id} amount={c.priceTzs} today={today} />}
                    </>
                  )}
                  <Payments list={c.payments} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="plans">
        <h2 id="plans" className="mb-2 font-semibold">
          {a.plans}
        </h2>
        <div className="flex flex-col gap-3">
          {plans.map((p) => (
            <details key={p.id} className="rounded-2xl border border-line bg-surface p-4">
              <summary className="cursor-pointer font-semibold">
                {name(p)} <span className="font-normal text-ink-muted">· {p.priceTzs == null ? a.noPrice : formatTzs(p.priceTzs)}</span>
              </summary>
              <div className="mt-4">
                <PlanEditor plan={p} canEdit={canConfigure} />
              </div>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="settings">
        <h2 id="settings" className="mb-2 font-semibold">
          {a.settings}
        </h2>
        <Card className="flex flex-col gap-3">
          {/* SEC-040: a changed payment number is the first thing to check if providers report a scam. */}
          <p className="text-xs text-ink-muted">
            {changed ? fill(a.instructionsChanged, { date: date.format(changed.at), name: changed.by ?? "—" }) : a.instructionsNeverChanged}
          </p>
          <SettingsForm initial={settings} canEdit={canConfigure} />
        </Card>
      </section>
    </div>
  );
}
