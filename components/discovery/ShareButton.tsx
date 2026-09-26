"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

/** Native share sheet on phones; copies the link elsewhere. */
export function ShareButton({ title }: { title: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href.split("#")[0]!.split("?")[0]!;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* dismissed */
    }
  };
  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? t.ui.profile.shared : t.ui.profile.share}
      title={copied ? t.ui.profile.shared : t.ui.profile.share}
      className="grid size-11 place-items-center rounded-full border border-line bg-surface/90 text-ink shadow-soft backdrop-blur transition active:scale-95"
    >
      {copied ? <Check aria-hidden className="size-5 text-success" /> : <Share2 aria-hidden className="size-5" />}
    </button>
  );
}
