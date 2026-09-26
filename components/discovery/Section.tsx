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
    <section className="mt-7 sm:mt-10">
      <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight sm:text-xl">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted sm:text-sm">{subtitle}</p>}
        </div>
        {href && linkLabel && (
          <Link href={href} className="flex shrink-0 items-center text-xs font-semibold text-link sm:text-sm">
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
