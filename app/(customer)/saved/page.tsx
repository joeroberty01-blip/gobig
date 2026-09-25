import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { favoriteProviderIds } from "@/lib/services/favorites";
import { providerCardsByIds } from "@/lib/services/discovery";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { CardGrid } from "@/components/discovery/Section";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.saved.title };
}

export default async function SavedPage() {
  const user = await requirePageAccess("favorites:use", "/saved");
  const { t, locale } = await getServerDictionary();
  const ids = await favoriteProviderIds(user.id);
  const cards = await providerCardsByIds(ids);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t.saved.title} />
      {cards.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center text-sm text-ink-muted">
          <Heart aria-hidden className="size-8 text-ink-subtle" />
          {t.saved.empty}
        </Card>
      ) : (
        <CardGrid>
          {cards.map((p) => (
            <ProviderCard key={p.id} p={p} t={t} locale={locale} />
          ))}
        </CardGrid>
      )}
      {cards.length < ids.length && <p className="mt-3 text-xs text-ink-subtle">{t.saved.unavailable}</p>}
    </div>
  );
}
