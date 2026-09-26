import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Section({
  title,
  subtitle,
  href,
  linkLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {href && linkLabel && (
          <Link href={href} className="flex shrink-0 items-center text-sm font-semibold text-brand-700">
            {linkLabel}
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">{children}</div>;
}
