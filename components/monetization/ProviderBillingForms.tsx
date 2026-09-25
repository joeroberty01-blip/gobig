"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelPlanRequestAction, requestCampaignAction, requestPlanAction, type BillingActionResult } from "@/lib/actions/billing";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState(false);
  const run = (fn: () => Promise<BillingActionResult>) =>
    start(async () => {
      setError(null);
      setDone(false);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setDone(true);
      router.refresh();
    });
  return { pending, error, done, run };
}

export function ChoosePlanButton({ planId, planName, disabled }: { planId: string; planName: string; disabled: boolean }) {
  const { t } = useI18n();
  const { pending, error, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <Button type="button" disabled={disabled || pending} onClick={() => run(() => requestPlanAction(planId))}>
        {fill(t.billing.provider.choose, { plan: planName })}
      </Button>
    </div>
  );
}

export function CancelPlanRequestButton() {
  const { t } = useI18n();
  const { pending, error, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => cancelPlanRequestAction())}>
        {t.billing.provider.cancelRequest}
      </Button>
    </div>
  );
}

type Named = { id: string; nameEn: string; nameSw: string };
const control = "block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base focus:outline-2 focus:outline-brand-500";

export function CampaignRequestForm({
  services,
  categories,
  areas,
  today,
}: {
  services: Named[];
  categories: Named[];
  areas: { id: string; name: string }[];
  today: string;
}) {
  const { t, locale } = useI18n();
  const b = t.billing.provider;
  const name = (x: Named) => (locale === "sw" ? x.nameSw : x.nameEn);
  const { pending, error, done, run } = useRun();
  const [kind, setKind] = useState<"FEATURED_SEARCH" | "SPONSORED_CATEGORY">("FEATURED_SEARCH");
  const [serviceId, setServiceId] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [locationId, setLocationId] = useState("");
  const [startsAt, setStartsAt] = useState(today);
  const [endsAt, setEndsAt] = useState(today);

  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          requestCampaignAction({
            kind,
            serviceId: kind === "FEATURED_SEARCH" ? serviceId : "",
            categoryId: kind === "SPONSORED_CATEGORY" ? categoryId : "",
            locationId,
            startsAt,
            endsAt,
          }),
        );
      }}
    >
      {error && (
        <div className="sm:col-span-2">
          <Alert>{t.errors[error] ?? t.errors.generic}</Alert>
        </div>
      )}
      {done && (
        <div className="sm:col-span-2">
          <Alert tone="success">{b.sent}</Alert>
        </div>
      )}
      <Field id="c-kind" label={b.kind}>
        <select id="c-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={control}>
          <option value="FEATURED_SEARCH">{b.kindFEATURED_SEARCH}</option>
          <option value="SPONSORED_CATEGORY">{b.kindSPONSORED_CATEGORY}</option>
        </select>
      </Field>
      {kind === "FEATURED_SEARCH" ? (
        <Field id="c-service" label={b.service}>
          <select id="c-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={control}>
            <option value="">{b.anyService}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {name(s)}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field id="c-category" label={b.category}>
          <select id="c-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={control}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id="c-area" label={b.area}>
        <select id="c-area" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={control}>
          <option value="">{b.anyArea}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="c-start" label={b.starts}>
          <Input id="c-start" type="date" min={today} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field id="c-end" label={b.ends}>
          <Input id="c-end" type="date" min={startsAt} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {b.send}
        </Button>
      </div>
    </form>
  );
}
