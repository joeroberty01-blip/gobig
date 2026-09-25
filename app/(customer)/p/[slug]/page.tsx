import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clock, MapPin, Pencil } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { getPublicProfile } from "@/lib/data/provider";
import { getSavedPoint } from "@/lib/discovery/area";
import { formatDistance } from "@/lib/geo";
import { fill } from "@/lib/i18n/dictionaries";
import { MapView } from "@/components/map/MapView";
import { ConnectButton } from "@/components/connect/ConnectButton";
import { availability } from "@/lib/provider/availability";
import { trustBadges } from "@/lib/provider/trust";
import { providerStats, publicMedianResponse } from "@/lib/services/ranking";
import { ownReview, publicReviews, reviewEligibility } from "@/lib/services/reviews";
import { RatingSummary, TrustBadges } from "@/components/trust/TrustBadges";
import { ReviewForm } from "@/components/trust/ReviewForms";
import { ReviewList } from "@/components/trust/ReviewList";
import { formatPrice, minutesToTime } from "@/lib/provider/format";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { trackProfileView } from "@/lib/analytics";
import { isFavorite } from "@/lib/services/favorites";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { ReportButton } from "@/components/admin/platform/ReportButton";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ reviews?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicProfile(slug, null);
  if (!profile) return { robots: { index: false } };
  return { title: profile.displayName, description: profile.description?.slice(0, 160) ?? undefined };
}

/** Current weekday in Dar es Salaam (UTC+3, no DST) as 1 = Monday … 7 = Sunday. */
function darWeekday(): number {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000).getUTCDay();
  return d === 0 ? 7 : d;
}

export default async function ProviderProfilePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const reviewsPageRaw = Number.parseInt((await searchParams).reviews ?? "1", 10);
  const reviewsPage = Number.isFinite(reviewsPageRaw) && reviewsPageRaw > 0 && reviewsPageRaw < 500 ? reviewsPageRaw : 1;
  const [viewer, point] = await Promise.all([getCurrentUser(), getSavedPoint()]);
  const { locale: viewerLocale } = await getServerDictionary();
  const p = await getPublicProfile(slug, viewer, point, viewerLocale);
  if (!p) notFound();
  // Phase 10: owner/admin previews aren't customer views (and the service skips them anyway).
  if (!p.preview) await trackProfileView(p.id);
  const { t, locale } = await getServerDictionary();
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const today = darWeekday();
  const categoryLabel = p.category ? [p.category.parent && name(p.category.parent), name(p.category)].filter(Boolean).join(" · ") : null;
  const areaLabel = p.area ? [p.area.name, p.area.district].filter(Boolean).join(", ") : null;
  const stats = (await providerStats([p.id])).get(p.id);
  const badges = trustBadges({
    verificationLevel: p.verificationLevel,
    ratingAvg: p.rating.avg,
    ratingCount: p.rating.count,
    availability: availability(p.openingHoursMode, p.openingHours),
    // Measured from real requests (Phase 7); shown only with enough answered requests.
    medianResponseMinutes: publicMedianResponse(stats),
  });
  const favorite = viewer?.role === "CUSTOMER" ? await isFavorite(viewer.id, p.id) : false;
  const [reviews, eligibility, mine] = await Promise.all([
    publicReviews(p.id, reviewsPage),
    reviewEligibility(viewer, p.id),
    viewer ? ownReview(viewer.id, p.id) : Promise.resolve(null),
  ]);
  const canReport = !!viewer && (viewer.role === "CUSTOMER" || viewer.role === "PROVIDER");
  const reviewBlocked = {
    login: t.trust.reviews.loginToReview,
    role: t.trust.reviews.providersCantReview,
    ownBusiness: t.trust.reviews.ownBusiness,
    providerUnavailable: null,
  };

  return (
    <div className="mx-auto max-w-3xl">
      {p.preview && (
        <div className="mb-4">
          <Alert tone="info">{t.profile.public.previewBanner}</Alert>
        </div>
      )}

      <header className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="relative aspect-[16/7] bg-brand-900">
          {p.cover && <Image src={p.cover.url} alt="" fill loading="eager" fetchPriority="high" sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />}
        </div>
        <div className="relative px-5 pb-5">
          <div className="-mt-10 mb-3 size-20 overflow-hidden rounded-2xl border-4 border-surface bg-brand-50">
            {p.logo ? (
              <Image src={p.logo.url} alt="" width={80} height={80} className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-2xl font-black text-brand-700">{p.displayName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{p.displayName}</h1>
          <div className="mt-1 text-sm">
            <RatingSummary avg={p.rating.avg} count={p.rating.count} t={t} />
          </div>
          {badges.length > 0 && (
            <div className="mt-2">
              <TrustBadges badges={badges} t={t} locale={locale} />
            </div>
          )}
          {categoryLabel && <p className="mt-0.5 text-sm font-medium text-brand-700">{categoryLabel}</p>}
          {areaLabel && (
            <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
              <MapPin aria-hidden className="size-4" />
              {areaLabel}
              {p.distance && <span> · {fill(t.location.away, { distance: formatDistance(p.distance.km, p.distance.precision) })}</span>}
            </p>
          )}
          {p.isOwner && (
            <ButtonLink href="/provider" variant="secondary" className="mt-4 min-h-9">
              <Pencil aria-hidden className="size-4" />
              {t.profile.public.editProfile}
            </ButtonLink>
          )}
        </div>
      </header>

      {/* Contact buttons: only the ones the provider chose, and only when the data exists. */}
      <section aria-label={t.profile.public.contact} className="mt-4">
        {p.actions.length ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {p.actions.map(
              ({ action, href }, i) =>
                href && <ConnectButton key={action} slug={p.slug} action={action} href={href} label={t.profile.actions[action]} source="PROFILE" primary={i === 0} />,
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t.profile.public.noContact}</p>
        )}
        {/* Phase 10: customers (and guests, via login) can save a provider. Hidden from the provider's own team and admins. */}
        {!p.preview && (!viewer || viewer.role === "CUSTOMER") && (
          <div className="mt-2">
            <FavoriteButton providerId={p.id} slug={p.slug} initial={favorite} signedInCustomer={viewer?.role === "CUSTOMER" && viewer.status === "ACTIVE"} />
          </div>
        )}
        {/* Phase 12: report a listing (fake, fraud, unsafe…). The provider's own team doesn't see it. */}
        {!p.preview && !p.isOwner && viewer && (viewer.role === "CUSTOMER" || viewer.role === "PROVIDER") && (
          <div className="mt-1">
            <ReportButton targetType="PROVIDER" targetId={p.id} />
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          {p.description && (
            <Card>
              <h2 className="mb-2 font-semibold">{t.profile.public.about}</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{p.description}</p>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-semibold">{t.profile.public.services}</h2>
            <ul className="divide-y divide-line">
              {p.services.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                  <span className="font-medium">{name(s)}</span>
                  <span className={`shrink-0 text-right ${s.priceType === "ON_QUOTE" ? "text-ink-subtle" : "font-semibold"}`}>
                    {formatPrice(s, t.profile.priceLabels)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-subtle">{t.profile.public.pricesNote}</p>
          </Card>

          <Card id="reviews">
            <h2 className="mb-1 flex items-center justify-between gap-3 font-semibold">
              {t.trust.reviews.title}
              <span className="text-sm font-normal">
                <RatingSummary avg={p.rating.avg} count={p.rating.count} t={t} compact />
              </span>
            </h2>
            {reviews.total > 0 && (
              <ReviewList reviews={reviews.reviews} providerName={p.displayName} t={t} locale={locale} canReport={canReport} ownReviewId={mine?.id ?? null} />
            )}
            {reviews.pages > 1 && (
              <nav className="mt-2 flex justify-between text-sm">
                {reviewsPage > 1 ? <Link href={`?reviews=${reviewsPage - 1}#reviews`} className="font-semibold text-brand-700">{t.trust.reviews.previous}</Link> : <span />}
                {reviewsPage < reviews.pages ? <Link href={`?reviews=${reviewsPage + 1}#reviews`} className="font-semibold text-brand-700">{t.trust.reviews.next}</Link> : <span />}
              </nav>
            )}
            <div className="mt-4 border-t border-line pt-4">
              {eligibility.allowed ? (
                <ReviewForm providerId={p.id} existing={mine} />
              ) : (
                reviewBlocked[eligibility.reason] && <p className="text-sm text-ink-muted">{reviewBlocked[eligibility.reason]}</p>
              )}
            </div>
          </Card>

          {p.gallery.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">{t.profile.public.photos}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {p.gallery.map((g) => (
                  <a key={g.id} href={g.url} target="_blank" rel="noopener" className="relative aspect-square overflow-hidden rounded-xl bg-canvas">
                    <Image src={g.url} alt="" fill sizes="(max-width: 640px) 50vw, 240px" className="object-cover" />
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <MapPin aria-hidden className="size-4" />
              {t.profile.public.location}
            </h2>
            {areaLabel && <p className="text-sm">{areaLabel}</p>}
            {p.addressText && <p className="mt-1 text-sm text-ink-muted">{p.addressText}</p>}
            {p.mapPoint && (
              <div className="mt-3">
                {/* Public point only: exact pin, ~500 m circle, or the area circle (ADR-006). */}
                <MapView
                  center={p.mapPoint}
                  zoom={p.mapPoint.precision === "exact" ? 15 : 13}
                  markers={[{ id: "p", ...p.mapPoint, label: p.displayName }]}
                  you={point}
                  youLabel={t.location.you}
                  className="h-48"
                />
                {p.mapPoint.precision !== "exact" && <p className="mt-1.5 text-xs text-ink-subtle">{t.location.mapApproxLegend}</p>}
              </div>
            )}
            {p.serviceRadiusKm && <p className="mt-3 text-sm text-ink-muted">{fill(t.location.radiusKm, { km: p.serviceRadiusKm })}</p>}
            {p.serviceAreas.length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t.profile.public.serviceAreas}</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {p.serviceAreas.map((a) => (
                    <li key={a.id} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink-muted">
                      {a.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <Clock aria-hidden className="size-4" />
              {t.profile.public.hours}
            </h2>
            {p.openingHoursMode === "ALWAYS_OPEN" ? (
              <p className="text-sm">{t.profile.public.alwaysOpen}</p>
            ) : p.openingHoursMode === "BY_APPOINTMENT" ? (
              <p className="text-sm">{t.profile.public.byAppointment}</p>
            ) : (
              <dl className="text-sm">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                  const rows = p.openingHours.filter((h) => h.dayOfWeek === day);
                  return (
                    <div key={day} className={`flex justify-between py-1 ${day === today ? "font-semibold text-ink" : "text-ink-muted"}`}>
                      <dt>{day === today ? `${t.profile.days[day - 1]} (${t.profile.public.today})` : t.profile.days[day - 1]}</dt>
                      <dd>{rows.length ? rows.map((r) => `${minutesToTime(r.opensAt)}–${minutesToTime(r.closesAt)}`).join(", ") : t.profile.fields.closed}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
            {p.hoursNote && <p className="mt-2 text-xs text-ink-muted">{p.hoursNote}</p>}
          </Card>

          {p.socialLinks.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">{t.profile.public.follow}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {p.socialLinks.map((s) => (
                  <li key={s.platform}>
                    <Link href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-brand-700 hover:underline">
                      {t.profile.social[s.platform]}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
