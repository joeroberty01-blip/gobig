"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelSubscriptionAction,
  campaignAction,
  recordPaymentAction,
  saveMonetizationSettingsAction,
  savePlanAction,
  voidPaymentAction,
  type BillingActionResult,
} from "@/lib/actions/billing";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { PAYMENT_METHODS } from "@/lib/validators/billing";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];
const control = "block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base focus:outline-2 focus:outline-brand-500";
const textarea = "block w-full rounded-xl border border-line bg-surface px-3 py-2 text-base focus:outline-2 focus:outline-brand-500";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState(false);
  const run = (fn: () => Promise<BillingActionResult>, after?: () => void) =>
    start(async () => {
      setError(null);
      setDone(false);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setDone(true);
      after?.();
      router.refresh();
    });
  return { pending, error, done, run };
}

function Status({ error, done }: { error: ErrorKey | null; done: boolean }) {
  const { t } = useI18n();
  if (error) return <Alert>{t.errors[error] ?? t.errors.generic}</Alert>;
  if (done) return <Alert tone="success">{t.billing.admin.saved}</Alert>;
  return null;
}

export type PlanRow = {
  id: string;
  code: string;
  nameEn: string;
  nameSw: string;
  descriptionEn: string;
  descriptionSw: string;
  priceTzs: number | null;
  periodDays: number;
  galleryLimit: number;
  leadsPerMonth: number | null;
  priorityVerificationReview: boolean;
  allowsCampaigns: boolean;
  isActive: boolean;
};

export function PlanEditor({ plan, canEdit }: { plan: PlanRow; canEdit: boolean }) {
  const { t } = useI18n();
  const a = t.billing.admin;
  const [f, setF] = useState({ ...plan, priceTzs: plan.priceTzs == null ? "" : String(plan.priceTzs), leadsPerMonth: plan.leadsPerMonth == null ? "" : String(plan.leadsPerMonth) });
  const { pending, error, done, run } = useRun();
  const free = plan.code === "FREE";
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          savePlanAction({
            planId: plan.id,
            nameEn: f.nameEn,
            nameSw: f.nameSw,
            descriptionEn: f.descriptionEn,
            descriptionSw: f.descriptionSw,
            priceTzs: f.priceTzs,
            periodDays: Number(f.periodDays),
            galleryLimit: Number(f.galleryLimit),
            leadsPerMonth: f.leadsPerMonth === "" ? null : Number(f.leadsPerMonth),
            priorityVerificationReview: f.priorityVerificationReview,
            allowsCampaigns: f.allowsCampaigns,
            isActive: f.isActive,
          }),
        );
      }}
    >
      <fieldset disabled={!canEdit || pending} className="contents">
        <div className="sm:col-span-2">
          <Status error={error} done={done} />
        </div>
        <Field id={`${plan.id}-en`} label={`${a.name} (EN)`}>
          <Input id={`${plan.id}-en`} value={f.nameEn} onChange={(e) => set("nameEn", e.target.value)} maxLength={40} />
        </Field>
        <Field id={`${plan.id}-sw`} label={`${a.name} (SW)`}>
          <Input id={`${plan.id}-sw`} value={f.nameSw} onChange={(e) => set("nameSw", e.target.value)} maxLength={40} />
        </Field>
        <Field id={`${plan.id}-den`} label={`${a.description} (EN)`}>
          <textarea id={`${plan.id}-den`} value={f.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} rows={3} maxLength={400} className={textarea} />
        </Field>
        <Field id={`${plan.id}-dsw`} label={`${a.description} (SW)`}>
          <textarea id={`${plan.id}-dsw`} value={f.descriptionSw} onChange={(e) => set("descriptionSw", e.target.value)} rows={3} maxLength={400} className={textarea} />
        </Field>
        <Field id={`${plan.id}-price`} label={a.price} hint={free ? undefined : a.priceHint}>
          <Input id={`${plan.id}-price`} inputMode="numeric" value={free ? "0" : f.priceTzs} disabled={free} onChange={(e) => set("priceTzs", e.target.value)} />
        </Field>
        <Field id={`${plan.id}-days`} label={a.period}>
          <Input id={`${plan.id}-days`} type="number" min={1} max={366} value={f.periodDays} onChange={(e) => set("periodDays", Number(e.target.value))} />
        </Field>
        <Field id={`${plan.id}-gal`} label={a.galleryLimit}>
          <Input id={`${plan.id}-gal`} type="number" min={1} max={60} value={f.galleryLimit} onChange={(e) => set("galleryLimit", Number(e.target.value))} />
        </Field>
        <Field id={`${plan.id}-leads`} label={a.leadsPerMonth}>
          <Input id={`${plan.id}-leads`} inputMode="numeric" value={f.leadsPerMonth} onChange={(e) => set("leadsPerMonth", e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2 text-sm sm:col-span-2">
          {(
            [
              ["priorityVerificationReview", a.priority],
              ["allowsCampaigns", a.campaigns],
              ["isActive", a.active],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={f[k]} disabled={k === "isActive" && free} onChange={(e) => set(k, e.target.checked)} className="size-4 accent-brand-700" />
              {label}
            </label>
          ))}
        </div>
        {canEdit && (
          <div className="sm:col-span-2">
            <Button type="submit">{a.savePlan}</Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

export function SettingsForm({
  initial,
  canEdit,
}: {
  initial: { paidLeadsEnabled: boolean; featuredSlots: number; paymentInstructionsEn: string | null; paymentInstructionsSw: string | null };
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const a = t.billing.admin;
  const [f, setF] = useState({ ...initial, paymentInstructionsEn: initial.paymentInstructionsEn ?? "", paymentInstructionsSw: initial.paymentInstructionsSw ?? "" });
  const { pending, error, done, run } = useRun();
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveMonetizationSettingsAction(f));
      }}
    >
      <fieldset disabled={!canEdit || pending} className="contents">
        <Status error={error} done={done} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.paidLeadsEnabled} onChange={(e) => setF({ ...f, paidLeadsEnabled: e.target.checked })} className="size-4 accent-brand-700" />
          {a.paidLeads}
        </label>
        <Field id="slots" label={a.featuredSlots}>
          <Input id="slots" type="number" min={0} max={5} value={f.featuredSlots} onChange={(e) => setF({ ...f, featuredSlots: Number(e.target.value) })} />
        </Field>
        <Field id="inst-en" label={a.instructionsEn} hint={a.instructionsHint}>
          <textarea id="inst-en" rows={3} maxLength={600} value={f.paymentInstructionsEn} onChange={(e) => setF({ ...f, paymentInstructionsEn: e.target.value })} className={textarea} />
        </Field>
        <Field id="inst-sw" label={a.instructionsSw}>
          <textarea id="inst-sw" rows={3} maxLength={600} value={f.paymentInstructionsSw} onChange={(e) => setF({ ...f, paymentInstructionsSw: e.target.value })} className={textarea} />
        </Field>
        {canEdit && (
          <div>
            <Button type="submit">{a.saveSettings}</Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

export function PaymentForm({ kind, targetId, amount, today }: { kind: "subscription" | "campaign"; targetId: string; amount: number | null; today: string }) {
  const { t } = useI18n();
  const a = t.billing.admin;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amountTzs: amount == null ? "" : String(amount), method: "MPESA" as (typeof PAYMENT_METHODS)[number], reference: "", paidAt: today });
  const { pending, error, run } = useRun();
  if (!open) {
    return (
      <Button type="button" variant="secondary" className="min-h-9" onClick={() => setOpen(true)}>
        {a.record}
      </Button>
    );
  }
  return (
    <form
      noValidate
      className="grid gap-2 rounded-xl bg-canvas p-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => recordPaymentAction(kind, { targetId, ...f }), () => setOpen(false));
      }}
    >
      {error && (
        <div className="sm:col-span-4">
          <Alert>{t.errors[error] ?? t.errors.generic}</Alert>
        </div>
      )}
      <Field id={`${targetId}-amt`} label={a.amount}>
        <Input id={`${targetId}-amt`} inputMode="numeric" value={f.amountTzs} onChange={(e) => setF({ ...f, amountTzs: e.target.value })} />
      </Field>
      <Field id={`${targetId}-m`} label={a.method}>
        <select id={`${targetId}-m`} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as typeof f.method })} className={control}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {a.methods[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${targetId}-ref`} label={a.reference_}>
        <Input id={`${targetId}-ref`} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} maxLength={60} autoCapitalize="characters" />
      </Field>
      <Field id={`${targetId}-date`} label={a.paidAt}>
        <Input id={`${targetId}-date`} type="date" max={today} value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} />
      </Field>
      <div className="flex gap-2 sm:col-span-4">
        <Button type="submit" disabled={pending}>
          {a.record}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

/** Cancel a subscription or void a payment — both need a written reason (audited). */
export function ReasonButton({ kind, id }: { kind: "cancelSubscription" | "voidPayment"; id: string }) {
  const { t } = useI18n();
  const a = t.billing.admin;
  const { pending, error, run } = useRun();
  return (
    <span className="inline-flex flex-col gap-1">
      {error && <span className="text-xs text-danger">{t.errors[error] ?? t.errors.generic}</span>}
      <button
        type="button"
        disabled={pending}
        className="text-xs font-semibold text-danger underline"
        onClick={() => {
          const reason = prompt(kind === "voidPayment" ? a.voidReason : a.cancelReason);
          if (!reason) return;
          run(() => (kind === "voidPayment" ? voidPaymentAction({ id, reason }) : cancelSubscriptionAction({ id, reason })));
        }}
      >
        {kind === "voidPayment" ? a.void : a.cancel}
      </button>
    </span>
  );
}

export function CampaignControls({ campaignId, status }: { campaignId: string; status: string }) {
  const { t } = useI18n();
  const a = t.billing.admin;
  const { pending, error, run } = useRun();
  const [price, setPrice] = useState("");
  const act = (action: "approve" | "reject" | "pause" | "resume" | "end") => run(() => campaignAction({ campaignId, action, priceTzs: action === "approve" ? price : undefined }));
  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <div className="flex flex-wrap items-end gap-2">
        {status === "REQUESTED" && (
          <>
            <Field id={`${campaignId}-price`} label={a.setPrice}>
              <Input id={`${campaignId}-price`} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="max-w-40" />
            </Field>
            <Button type="button" className="min-h-9" disabled={pending || !price} onClick={() => act("approve")}>
              {a.approve}
            </Button>
          </>
        )}
        {(status === "REQUESTED" || status === "PENDING_PAYMENT") && (
          <Button type="button" variant="ghost" className="min-h-9" disabled={pending} onClick={() => act("reject")}>
            {a.reject}
          </Button>
        )}
        {status === "ACTIVE" && (
          <Button type="button" variant="secondary" className="min-h-9" disabled={pending} onClick={() => act("pause")}>
            {a.pause}
          </Button>
        )}
        {status === "PAUSED" && (
          <Button type="button" variant="secondary" className="min-h-9" disabled={pending} onClick={() => act("resume")}>
            {a.resume}
          </Button>
        )}
        {(status === "ACTIVE" || status === "PAUSED" || status === "PENDING_PAYMENT") && (
          <Button type="button" variant="ghost" className="min-h-9" disabled={pending} onClick={() => act("end")}>
            {a.end}
          </Button>
        )}
      </div>
    </div>
  );
}
