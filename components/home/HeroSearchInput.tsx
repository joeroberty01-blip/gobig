"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's search text (owner's mockup): on phones the hint wraps over two lines, which a normal
 * input can't do, so it's a textarea that submits on Enter like a search box. Phones get a shorter
 * hint so it fits in the narrow bar. Still a plain form field: works with the form's GET submit.
 */
export function HeroSearchInput({ placeholder, shortPlaceholder }: { placeholder: string; shortPlaceholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => (el.placeholder = mq.matches ? shortPlaceholder : placeholder);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [placeholder, shortPlaceholder]);

  return (
    <textarea
      ref={ref}
      name="q"
      required
      rows={2}
      maxLength={300}
      placeholder={placeholder}
      aria-label={placeholder}
      enterKeyHint="search"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
      onInput={(e) => {
        // Keep it one line of text even if something is pasted with line breaks.
        const el = e.currentTarget;
        if (el.value.includes("\n")) el.value = el.value.replace(/\s*\n\s*/g, " ");
      }}
      className="block min-h-11 min-w-0 flex-1 resize-none self-center overflow-hidden bg-transparent px-1 py-1 text-[11.5px] leading-snug text-ink placeholder:text-ink-subtle focus:outline-none sm:px-2 sm:text-base lg:h-7 lg:overflow-hidden lg:py-0.5 lg:whitespace-nowrap"
    />
  );
}
