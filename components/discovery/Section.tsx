import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Section({ title, href, linkLabel, children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
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
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
