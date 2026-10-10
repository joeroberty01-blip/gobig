import Image from "next/image";
import Link from "next/link";
import { existsSync } from "node:fs";
import path from "node:path";
import { ArrowRight } from "lucide-react";
import { CategoryIcon } from "@/components/discovery/CategoryIcon";

// One accent per card for the round icon (reference design), cycling in order.
export const ACCENTS = ["#1f5ff2", "#ef4444", "#7c3aed", "#16a34a", "#ec4899", "#4338ca", "#f97316", "#0d9488"];

/** A photo for the category if we have one (public/categories/<slug>.webp), else an illustrated tile. */
export function photoFor(slug: string): string | null {
  return existsSync(path.join(process.cwd(), "public", "categories", `${slug}.webp`)) ? `/categories/${slug}.webp` : null;
}

/**
 * The category card (home "Popular Services" and the categories page): photo or tinted
 * illustration, the name with its icon inline in the category's colour, and what's inside.
 * `rowOnPhone`: a compact row (thumbnail, text, arrow) under 640 px so a phone shows 6–7 categories
 * instead of 4 — design system v2, "content over containers".
 */
export function CategoryCard({
  href,
  name,
  icon,
  subtitle,
  index,
  photo,
  rowOnPhone = false,
}: {
  href: string;
  name: string;
  icon: string | null;
  subtitle: string;
  index: number;
  photo?: string | null;
  rowOnPhone?: boolean;
}) {
  const accent = ACCENTS[index % ACCENTS.length]!;
  const row = rowOnPhone;
  return (
    <Link
      href={href}
      className={`group flex h-full overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-line/60 transition hover:-translate-y-0.5 hover:shadow-lift ${
        row ? "items-center gap-3 p-2 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0" : "flex-col"
      }`}
    >
      <span className={`relative block shrink-0 overflow-hidden ${row ? "size-[72px] rounded-xl sm:aspect-[5/4] sm:size-auto sm:w-full sm:rounded-none" : "aspect-[5/4]"}`}>
        {photo ? (
          <Image src={photo} alt="" fill sizes={row ? "(max-width: 640px) 72px, 240px" : "(max-width: 640px) 50vw, 240px"} className="object-cover object-top transition duration-500 group-hover:scale-105" />
        ) : (
          <span className="grid size-full place-items-center" style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}55)` }}>
            <CategoryIcon name={icon} className={row ? "size-8 opacity-60 sm:size-14" : "size-14 opacity-60"} />
          </span>
        )}
      </span>
      <span className={`flex min-w-0 flex-1 flex-col ${row ? "sm:px-4 sm:pt-3 sm:pb-3" : "px-3 pt-3 pb-3 sm:px-4"}`}>
        <span className="flex min-w-0 items-start gap-1.5">
          <CategoryIcon name={icon} className="mt-0.5 size-4 shrink-0" style={{ color: accent }} />
          <span className="line-clamp-2 text-[13px] leading-tight font-semibold sm:text-[15px]">{name}</span>
        </span>
        {subtitle && <span className={`mt-1 text-[11px] leading-snug text-ink-muted sm:text-xs ${row ? "line-clamp-1 sm:line-clamp-2" : "line-clamp-2"}`}>{subtitle}</span>}
        <span className={`mt-auto justify-end pt-2 ${row ? "hidden sm:flex" : "flex"}`}>
          <span className="grid size-7 place-items-center rounded-full bg-action/10 text-action transition group-hover:bg-action group-hover:text-white">
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        </span>
      </span>
      {row && <ArrowRight aria-hidden className="mr-2 size-4 shrink-0 text-action sm:hidden" />}
    </Link>
  );
}
