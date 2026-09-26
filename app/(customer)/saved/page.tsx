import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { favoriteProviderIds } from "@/lib/services/favorites";
import { providerCardsByIds } from "@/lib/services/discovery";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { CardGrid } from "@/components/discovery/Section";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

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
        <EmptyState
          icon={<Heart aria-hidden />}
          title={t.saved.empty}
          action={
            <ButtonLink href="/search" variant="night">
              {t.ui.nav.explore}
            </ButtonLink>
          }
        />
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
