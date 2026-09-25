import { forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "accent" | "onDark" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-900 disabled:bg-brand-700/60",
  accent: "bg-accent-400 text-brand-900 hover:bg-accent-500",
  onDark: "border border-white/30 bg-white/10 text-white hover:bg-white/20",
  secondary: "bg-surface text-ink border border-line hover:bg-canvas",
  ghost: "text-ink-muted hover:bg-canvas hover:text-ink",
  danger: "bg-danger text-white hover:bg-red-700",
};

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className = "", invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={`block min-h-11 w-full rounded-xl border bg-surface px-3.5 text-base text-ink placeholder:text-ink-subtle focus:outline-2 focus:outline-offset-0 focus:outline-brand-500 ${
          invalid ? "border-danger" : "border-line"
        } ${className}`}
        {...props}
      />
    );
  },
);

/** Label + control + hint/error, wired for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`} {...props} />;
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success" | "info"; children: React.ReactNode }) {
  const tones = {
    danger: "bg-danger-soft text-danger border-red-200",
    success: "bg-success-soft text-success border-green-200",
    info: "bg-brand-50 text-brand-900 border-brand-100",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
