"use client";

import { useState } from "react";
import { saveContactAction, saveDescriptionAction, saveNameAction, saveWhatsappAction } from "@/lib/actions/provider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { MIN_DESCRIPTION } from "@/lib/provider/completion";
import { Field, Input } from "@/components/ui";
import { FormError, StepActions, useStepSubmit, type StepProps } from "./shared";

/** 0712345678-style display for a stored 2557… number, so the field reads naturally. */
export function localPhone(stored: string | null | undefined): string {
  if (!stored) return "";
  return /^255\d{9}$/.test(stored) ? `0${stored.slice(3)}` : `+${stored}`;
}

export function NameStep(props: StepProps & { initial: string }) {
  const { t } = useI18n();
  const [value, setValue] = useState(props.initial);
  const { submit, pending, error, stepArg } = useStepSubmit(props);
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), submit(() => saveNameAction({ displayName: value }, stepArg)))} className="flex flex-col gap-4">
      <FormError error={error} />
      <Field id="displayName" label={t.profile.fields.businessName}>
        <Input
          id="displayName"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t.profile.fields.businessNamePlaceholder}
          maxLength={80}
          autoComplete="organization"
          autoFocus
          invalid={!!error}
        />
      </Field>
      <StepActions {...props} pending={pending} />
    </form>
  );
}

export function DescriptionStep(props: StepProps & { initial: string }) {
  const { t } = useI18n();
  const [value, setValue] = useState(props.initial);
  const { submit, pending, error, stepArg } = useStepSubmit(props);
  const short = value.trim().length < MIN_DESCRIPTION;
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), submit(() => saveDescriptionAction({ description: value }, stepArg)))} className="flex flex-col gap-4">
      <FormError error={error} />
      <Field id="description" label={t.profile.fields.description}>
        <textarea
          id="description"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={7}
          maxLength={1500}
          className="block w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base focus:outline-2 focus:outline-brand-500"
        />
      </Field>
      <p className={`-mt-2 text-right text-xs ${short ? "text-accent-500" : "text-ink-subtle"}`}>
        {fill(t.profile.fields.characters, { count: value.length })}
      </p>
      <StepActions {...props} pending={pending} />
    </form>
  );
}

export function ContactStep(props: StepProps & { phone: string | null; email: string | null }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState(localPhone(props.phone));
  const [email, setEmail] = useState(props.email ?? "");
  const { submit, pending, error, stepArg } = useStepSubmit(props);
  const err = (f: string) => (error?.field === f ? t.errors[error.key] : undefined);
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), submit(() => saveContactAction({ phone, email }, stepArg)))} className="flex flex-col gap-4">
      {error && !error.field && <FormError error={error} />}
      <Field id="phone" label={t.profile.fields.phone} error={err("phone")}>
        <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" invalid={!!err("phone")} />
      </Field>
      <Field id="email" label={t.profile.fields.businessEmail} error={err("email")}>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!err("email")} />
      </Field>
      <StepActions {...props} pending={pending} />
    </form>
  );
}

export function WhatsappStep(props: StepProps & { whatsapp: string | null; phone: string | null }) {
  const { t } = useI18n();
  const phoneLocal = localPhone(props.phone);
  const [value, setValue] = useState(localPhone(props.whatsapp));
  const same = !!phoneLocal && value === phoneLocal;
  const { submit, skip, pending, error, stepArg } = useStepSubmit(props);
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), submit(() => saveWhatsappAction({ whatsapp: value }, stepArg)))} className="flex flex-col gap-4">
      <FormError error={error} />
      {phoneLocal && (
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-4">
          <input type="checkbox" checked={same} onChange={(e) => setValue(e.target.checked ? phoneLocal : "")} className="size-5 accent-brand-700" />
          <span className="text-sm font-medium">{t.profile.fields.sameAsPhone}</span>
        </label>
      )}
      <Field id="whatsapp" label={t.profile.fields.whatsapp}>
        <Input id="whatsapp" type="tel" inputMode="tel" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0712 345 678" invalid={!!error} />
      </Field>
      <StepActions {...props} pending={pending} onSkip={skip} />
    </form>
  );
}
