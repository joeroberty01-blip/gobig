"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

export function LoginForm({ callbackUrl }: { callbackUrl: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [formError, setFormError] = useState<ErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const err = (key?: string) => (key ? t.errors[key as ErrorKey] ?? t.errors.generic : undefined);

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await signIn("credentials", { ...data, redirect: false });
    if (result?.error) {
      const known = ["suspended", "invalidCredentials", "rateLimited"] as const;
      setFormError(known.find((k) => k === result.code) ?? "generic");
      return;
    }
    // /continue picks the right home for the role when no callback was requested.
    router.push(callbackUrl ?? "/continue");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert>{t.errors[formError]}</Alert>}
      <Field id="identifier" label={t.auth.identifier} error={err(errors.identifier?.message)}>
        <Input
          id="identifier"
          autoComplete="username"
          placeholder={t.auth.identifierPlaceholder}
          invalid={!!errors.identifier}
          {...register("identifier")}
        />
      </Field>
      <Field id="password" label={t.auth.password} error={err(errors.password?.message)}>
        <Input id="password" type="password" autoComplete="current-password" invalid={!!errors.password} {...register("password")} />
      </Field>
      <div className="-mt-1 text-right">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
          {t.auth.forgotPassword}
        </Link>
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? t.auth.loggingIn : t.auth.loginTitle}
      </Button>
    </form>
  );
}
