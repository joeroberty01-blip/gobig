"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAdminSchema, type CreateAdminInput } from "@/lib/validators/auth";
import { createAdminAction } from "@/lib/actions/admin";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button, ButtonLink, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

export function CreateAdminForm() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<ErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateAdminInput>({ resolver: zodResolver(createAdminSchema) });

  const err = (key?: string) => (key ? t.errors[key as ErrorKey] ?? t.errors.generic : undefined);

  const onSubmit = handleSubmit(async () => {
    setFormError(null);
    const result = await createAdminAction(getValues());
    if (result.ok) return setDone(true);
    if (result.field) setError(result.field as keyof CreateAdminInput, { message: result.error });
    else setFormError(result.error);
  });

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t.admin.adminCreated}</Alert>
        <ButtonLink href="/admin/users" variant="secondary">
          {t.common.back}
        </ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert>{t.errors[formError]}</Alert>}
      <Field id="name" label={t.auth.fullName} error={err(errors.name?.message)}>
        <Input id="name" autoComplete="off" invalid={!!errors.name} {...register("name")} />
      </Field>
      <Field id="email" label={t.admin.adminEmail} error={err(errors.email?.message)}>
        <Input id="email" type="email" autoComplete="off" invalid={!!errors.email} {...register("email")} />
      </Field>
      <Field id="password" label={t.auth.password} hint={t.auth.passwordHint} error={err(errors.password?.message)}>
        <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register("password")} />
      </Field>
      <Field id="confirmPassword" label={t.auth.confirmPassword} error={err(errors.confirmPassword?.message)}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t.admin.creating : t.admin.createAdmin}
      </Button>
    </form>
  );
}
