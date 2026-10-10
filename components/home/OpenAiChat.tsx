"use client";

import { Sparkles } from "lucide-react";

/** Event the floating Go Big AI chat listens for (components/layout/AskFab.tsx). */
export const OPEN_AI_CHAT = "gobig:open-ai-chat";

/** Opens the floating Go Big AI chat instead of going to another page (owner, 2026-10-10). */
export function OpenAiChat({ label, className = "" }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_AI_CHAT))} className={className}>
      <Sparkles aria-hidden className="size-4" />
      {label}
    </button>
  );
}
