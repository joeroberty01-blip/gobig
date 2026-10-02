"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { retryAutomationRunAction, retryJobAction } from "@/lib/actions/automation";

/** Phase I: put a failed rule run or background job back in the queue. Text comes from the page. */
export function RetryButton({ kind, id, label, doneLabel, errorLabel }: { kind: "run" | "job"; id: string; label: string; doneLabel: string; errorLabel: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      className="min-h-9 px-3 text-xs"
      disabled={pending || state === "done"}
      onClick={() =>
        start(async () => {
          const r = kind === "run" ? await retryAutomationRunAction(id) : await retryJobAction(id);
          setState(r.ok ? "done" : "error");
          if (r.ok) router.refresh();
        })
      }
    >
      <RotateCcw aria-hidden className="size-3.5" />
      {state === "done" ? doneLabel : state === "error" ? errorLabel : label}
    </Button>
  );
}
