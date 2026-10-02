import type { Metadata } from "next";
import Image from "next/image";
import { BadgeCheck, EyeOff, MessageSquare, Search, Scale, ShieldCheck, Star, Store, Tag } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { infoText } from "@/lib/i18n/info";
import { ButtonLink } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerDictionary();
  return { title: infoText(locale).about.title };
}

const STEP_ICONS = [Search, Scale, MessageSquare, Star];
const PRINCIPLE_ICONS = [BadgeCheck, Tag, EyeOff];

export default async function AboutPage() {
  const { locale } = await getServerDictionary();
  const a = infoText(locale).about;
  return (
    <div className="mx-auto max-w-5xl">
      <section className="relative -mx-4 -mt-6 overflow-hidden bg-gradient-to-b from-[#eef4ff] to-canvas px-4 pt-8 pb-8 sm:mx-0 sm:mt-0 sm:rounded-[2rem] sm:px-10 sm:pt-12">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[45%] lg:block">
          <Image src="/hero-dar.webp" alt="" fill sizes="45vw" className="object-cover [clip-path:ellipse(92%_120%_at_100%_50%)]" />
        </div>
        <div className="relative max-w-xl">
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{a.title}</h1>
          <p className="mt-3 text-base text-ink-muted sm:text-lg">{a.lead}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/ask" className="rounded-full px-6">{a.askCta}</ButtonLink>
            <ButtonLink href="/signup?role=provider" variant="secondary" className="rounded-full px-6">{a.businessCta}</ButtonLink>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{a.howTitle}</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {a.steps.map((s, i) => {
            const Icon = STEP_ICONS[i] ?? Search;
            return (
              <li key={s.title} className="rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-line/60">
                <span className="flex items-center gap-2">
                  <span className="grid size-10 place-items-center rounded-full bg-action text-white"><Icon aria-hidden className="size-5" /></span>
                  <span className="text-xs font-bold text-ink-subtle">{i + 1}</span>
                </span>
                <h3 className="mt-3 font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{a.principlesTitle}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {a.principles.map((p, i) => {
            const Icon = PRINCIPLE_ICONS[i] ?? ShieldCheck;
            return (
              <li key={p.title} className="flex gap-3 rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-line/60">
                <Icon aria-hidden className="size-7 shrink-0 text-action" strokeWidth={1.75} />
                <span>
                  <span className="block font-bold">{p.title}</span>
                  <span className="mt-1 block text-sm text-ink-muted">{p.body}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10 flex flex-col items-start gap-4 rounded-3xl bg-night-900 p-6 text-white sm:flex-row sm:items-center sm:p-8">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10"><Store aria-hidden className="size-6 text-cta" /></span>
        <span className="flex-1">
          <span className="block text-lg font-bold">{a.businessTitle}</span>
          <span className="block text-sm text-white/70">{a.businessBody}</span>
        </span>
        <ButtonLink href="/signup?role=provider" className="rounded-full px-6">{a.businessCta}</ButtonLink>
      </section>
    </div>
  );
}
