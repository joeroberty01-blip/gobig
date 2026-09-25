"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { BriefcaseBusiness, Search } from "lucide-react";
import { signupSchema, type SignupFormInput, type SignupData } from "@/lib/validators/auth";
import { signupAction } from "@/lib/actions/auth";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { SelfServiceRole } from "@/lib/roles";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];
type FieldName = keyof SignupFormInput;

export function SignupForm({ initialRole }: { initialRole: SelfServiceRole | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [role, setRole] = useState<SelfServiceRole | null>(initialRole);
  const [formError, setFormError] = useState<ErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormInput, unknown, SignupData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: initialRole ?? undefined },
  });

  const err = (key?: string) => (key ? t.errors[key as ErrorKey] ?? t.errors.generic : undefined);

  const pickRole = (r: SelfServiceRole) => {
    setRole(r);
    setValue("role", r);
  };

  const onSubmit = handleSubmit(async () => {
    setFormError(null);
    // Send the raw values; the server validates them again with the same schema.
    const values = getValues();
    const result = await signupAction(values);
    if (!result.ok) {
      if (result.field && result.field in values) setError(result.field as FieldName, { message: result.error });
      else setFormError(result.error);
      return;
    }
    const identifier = values.email?.trim() || values.phone?.trim() || "";
    const login = await signIn("credentials", { identifier, password: values.password, redirect: false });
    router.push(login?.error ? "/login" : "/continue");
    router.refresh();
  });

  if (!role) {
    const options: { value: SelfServiceRole; title: string; body: string; Icon: typeof Search }[] = [
      { value: "CUSTOMER", title: t.auth.roleCustomerTitle, body: t.auth.roleCustomerBody, Icon: Search },
      { value: "PROVIDER", title: t.auth.roleProviderTitle, body: t.auth.roleProviderBody, Icon: BriefcaseBusiness },
    ];
    return (
      <fieldset>
        <legend className="mb-3 text-base font-semibold">{t.auth.chooseRole}</legend>
        <div className="flex flex-col gap-3">
          {options.map(({ value, title, body, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => pickRole(value)}
              className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Icon aria-hidden className="size-5" />
              </span>
              <span>
                <span className="block font-semibold text-ink">{title}</span>
                <span className="mt-0.5 block text-sm text-ink-muted">{body}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-sm">
        <span className="font-semibold text-brand-900">
          {role === "PROVIDER" ? t.auth.roleProviderTitle : t.auth.roleCustomerTitle}
        </span>
        <button type="button" onClick={() => setRole(null)} className="font-medium text-brand-700 hover:underline">
          {t.auth.changeRole}
        </button>
      </div>
      <input type="hidden" {...register("role")} />
      {formError && <Alert>{t.errors[formError]}</Alert>}

      <Field id="name" label={role === "PROVIDER" ? t.auth.fullNameProvider : t.auth.fullName} error={err(errors.name?.message)}>
        <Input id="name" autoComplete="name" invalid={!!errors.name} {...register("name")} />
      </Field>
      <Field id="phone" label={t.auth.phone} hint={t.auth.contactHint} error={err(errors.phone?.message)}>
        <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder={t.auth.phonePlaceholder} invalid={!!errors.phone} {...register("phone")} />
      </Field>
      <Field id="email" label={t.auth.email} error={err(errors.email?.message)}>
        <Input id="email" type="email" autoComplete="email" placeholder={t.auth.emailPlaceholder} invalid={!!errors.email} {...register("email")} />
      </Field>
      <Field id="password" label={t.auth.password} hint={t.auth.passwordHint} error={err(errors.password?.message)}>
        <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register("password")} />
      </Field>
      <Field id="confirmPassword" label={t.auth.confirmPassword} error={err(errors.confirmPassword?.message)}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? t.auth.signingUp : t.auth.signupButton}
      </Button>
    </form>
  );
}
