"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishAction, unpublishAction } from "@/lib/actions/provider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

export function PublishControls({ status, canPublish }: { status: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED"; canPublish: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);

  const run = (fn: () => ReturnType<typeof publishAction>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      router.refresh();
    });

  // Nothing to press while suspended/under review, or while required items are still missing
  // (the page lists those instead of showing a dead button).
  if (status === "SUSPENDED" || status === "PENDING_REVIEW") return null;
  if (status === "DRAFT" && !canPublish && !error) return null;

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      {status === "DRAFT" ? (
        <Button type="button" onClick={() => run(publishAction)} disabled={pending || !canPublish} className="w-full sm:w-auto">
          {pending ? t.profile.dashboard.publishing : t.profile.dashboard.publish}
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          className="w-full sm:w-auto"
          onClick={() => window.confirm(t.profile.dashboard.unpublishConfirm) && run(unpublishAction)}
        >
          {t.profile.dashboard.unpublish}
        </Button>
      )}
    </div>
  );
}
