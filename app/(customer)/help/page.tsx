import type { Metadata } from "next";
import { ChevronDown, Sparkles } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { infoText } from "@/lib/i18n/info";
import { ButtonLink } from "@/components/ui";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { DeskCall, DeskWhatsApp } from "@/components/support/DeskWhatsApp";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerDictionary();
  return { title: infoText(locale).help.title };
}

export default async function HelpPage() {
  const [{ t, locale }, platform] = await Promise.all([getServerDictionary(), getPlatformSettings()]);
  const h = infoText(locale).help;
  // Only contacts the admin has actually set in Platform settings; nothing is shown otherwise.
  const support = [platform.supportPhone, platform.supportWhatsapp && `WhatsApp ${platform.supportWhatsapp}`, platform.supportEmail].filter(Boolean);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{h.title}</h1>
      <p className="mt-2 text-ink-muted">{h.lead}</p>

      <h2 className="mt-8 text-lg font-bold">{h.faqTitle}</h2>
      {/* Native disclosure: works without JavaScript and with screen readers. */}
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-line/60">
        {h.faqs.map((f) => (
          <li key={f.q}>
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown aria-hidden className="size-5 shrink-0 text-ink-subtle transition group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-4 text-sm text-ink-muted">{f.a}</p>
            </details>
          </li>
        ))}
      </ul>

      <section className="mt-8 rounded-3xl bg-gradient-to-br from-[#eef4ff] to-surface p-6 ring-1 ring-line/60">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Sparkles aria-hidden className="size-5 text-action" />
          {h.stillTitle}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{h.stillBody}</p>
        {support.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="font-semibold">{t.account.support}: </span>
            <span className="text-ink-muted">{support.join(" · ")}</span>
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <DeskWhatsApp number={platform.supportWhatsapp} locale={locale} className="rounded-full px-6" />
          <DeskCall number={platform.supportPhone} locale={locale} className="rounded-full px-6" />
          <ButtonLink href="/ask" className="rounded-full px-6">{h.askCta}</ButtonLink>
          <ButtonLink href="/categories" variant="secondary" className="rounded-full px-6">{h.browseCta}</ButtonLink>
        </div>
      </section>
    </div>
  );
}
