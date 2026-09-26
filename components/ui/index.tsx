import { forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "night" | "accent" | "onDark" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white shadow-soft hover:bg-brand-600 disabled:opacity-60",
  night: "bg-night-900 text-white shadow-soft hover:bg-night-700 disabled:opacity-60",
  accent: "bg-accent-400 text-night-900 hover:bg-accent-500",
  onDark: "border border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20",
  secondary: "bg-surface text-ink border border-line hover:border-ink-subtle/40 hover:bg-canvas",
  ghost: "text-ink-muted hover:bg-canvas hover:text-ink",
  danger: "bg-danger text-white hover:opacity-90",
};

// Phase 14: a slight press-in on tap is the app's one consistent micro-interaction.
const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:active:scale-100";

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
        className={`block min-h-11 w-full rounded-xl border bg-surface px-3.5 text-base text-ink transition placeholder:text-ink-subtle focus:border-brand-500 focus:outline-2 focus:outline-offset-0 focus:outline-brand-500/40 ${
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
  return <div className={`rounded-2xl border border-line bg-surface p-5 shadow-soft ${className}`} {...props} />;
}

/** Shimmering placeholder while content loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** A friendly "nothing here yet" block: icon, title, one line of help, optional action. */
export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700 [&>svg]:size-7">{icon}</span>
      <h2 className="text-base font-semibold">{title}</h2>
      {body && <p className="max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success" | "info"; children: React.ReactNode }) {
  const tones = {
    danger: "bg-danger-soft text-danger border-danger/25",
    success: "bg-success-soft text-success border-success/25",
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
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
