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
 * The category card from the owner's reference design (home "Popular Services" and the categories
 * page): photo or tinted illustration, a coloured round icon, the name, and what's inside.
 */
export function CategoryCard({ href, name, icon, subtitle, index, photo }: { href: string; name: string; icon: string | null; subtitle: string; index: number; photo?: string | null }) {
  const accent = ACCENTS[index % ACCENTS.length]!;
  return (
    <Link href={href} className="group flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-line/60 transition hover:-translate-y-0.5 hover:shadow-lift">
      <span className="relative block aspect-[5/4] overflow-hidden">
        {photo ? (
          <Image src={photo} alt="" fill sizes="(max-width: 640px) 50vw, 240px" className="object-cover object-top transition duration-500 group-hover:scale-105" />
        ) : (
          <span className="grid size-full place-items-center" style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}55)` }}>
            <CategoryIcon name={icon} className="size-14 opacity-60" />
          </span>
        )}
      </span>
      <span className="relative flex flex-1 flex-col px-3 pt-7 pb-3 sm:px-4">
        {/* White tile with the icon in the category's colour (owner's mockup), over the photo's corner. */}
        <span className="absolute -top-6 left-3 grid size-11 place-items-center rounded-xl bg-surface shadow-lift ring-1 ring-line/60 sm:left-4" style={{ color: accent }}>
          <CategoryIcon name={icon} className="size-5" />
        </span>
        <span className="line-clamp-2 text-[13px] leading-tight font-semibold sm:text-[15px]">{name}</span>
        {subtitle && <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-muted sm:text-xs">{subtitle}</span>}
        <span className="mt-auto flex justify-end pt-2">
          <span className="grid size-7 place-items-center rounded-full bg-action/10 text-action transition group-hover:bg-action group-hover:text-white">
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        </span>
      </span>
    </Link>
  );
}
