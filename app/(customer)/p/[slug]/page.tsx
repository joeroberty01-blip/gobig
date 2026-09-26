import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Clock, MapPin, Pencil } from "lucide-react";
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
import { ShareButton } from "@/components/discovery/ShareButton";
import { availabilityLabel } from "@/components/discovery/ProviderCard";
import { CompareToggle } from "@/components/discovery/Compare";

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

const AVAIL_TONE = { open: "bg-success-soft text-success", closed: "bg-canvas text-ink-muted", neutral: "bg-brand-50 text-brand-900" };

// Public profile (Phase 2, redesigned in Phase 14): cover, identity, contact, then sections with a
// sticky jump bar, and a "Request service" bar on phones. Everything shown is the provider's own
// data; nothing is filled in for them.
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
  const u = t.ui.profile;
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const today = darWeekday();
  const categoryLabel = p.category ? [p.category.parent && name(p.category.parent), name(p.category)].filter(Boolean).join(" · ") : null;
  const areaLabel = p.area ? [p.area.name, p.area.district].filter(Boolean).join(", ") : null;
  const stats = (await providerStats([p.id])).get(p.id);
  const avail = availability(p.openingHoursMode, p.openingHours);
  const availText = availabilityLabel(avail, t);
  const badges = trustBadges({
    verificationLevel: p.verificationLevel,
    ratingAvg: p.rating.avg,
    ratingCount: p.rating.count,
    availability: avail,
    // Measured from real requests (Phase 7); shown only with enough answered requests.
    medianResponseMinutes: publicMedianResponse(stats),
  });
  const verified = badges.some((b) => b.kind === "VERIFIED");
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
  const customerView = !p.preview && !p.isOwner && (!viewer || viewer.role === "CUSTOMER");
  // The cheapest listed service, in the provider's own price wording (never an invented "from").
  const cheapest = p.services
    .filter((s) => s.priceType !== "ON_QUOTE" && s.priceMin != null)
    .sort((a, b) => a.priceMin! - b.priceMin!)[0];
  const priceText = cheapest ? formatPrice(cheapest, t.profile.priceLabels) : null;
  // A "From …" price already says so; don't repeat the word.
  const fromLabel = cheapest && cheapest.priceType !== "FROM" ? u.fromPrice : null;
  const requestHref = `/requests/new?provider=${encodeURIComponent(p.slug)}`;

  const sections = [
    { id: "overview", label: u.overview, show: true },
    { id: "services", label: u.services, show: true },
    { id: "reviews", label: u.reviews, show: true },
    { id: "photos", label: u.photos, show: p.gallery.length > 0 },
    { id: "hours", label: u.hours, show: true },
    { id: "location", label: u.location, show: true },
  ].filter((s) => s.show);

  return (
    <div className={`mx-auto max-w-5xl ${customerView ? "pb-20 md:pb-0" : ""}`}>
      {p.preview && (
        <div className="mb-4">
          <Alert tone="info">{t.profile.public.previewBanner}</Alert>
        </div>
      )}

      {/* Cover */}
      <div className="relative -mx-4 -mt-6 aspect-[16/9] overflow-hidden bg-hero sm:mx-0 sm:mt-0 sm:aspect-[3/1] sm:rounded-[2rem]">
        {p.cover && <Image src={p.cover.url} alt="" fill loading="eager" fetchPriority="high" sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" />}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night-900/50 via-transparent to-night-900/25" />
        <div className="absolute top-3 right-3 flex gap-2 sm:top-4 sm:right-4">
          {!p.preview && (!viewer || viewer.role === "CUSTOMER") && (
            <FavoriteButton providerId={p.id} slug={p.slug} initial={favorite} signedInCustomer={viewer?.role === "CUSTOMER" && viewer.status === "ACTIVE"} round />
          )}
          {customerView && <CompareToggle slug={p.slug} name={p.displayName} round />}
          <ShareButton title={p.displayName} />
        </div>
      </div>

      {/* Identity + contact */}
      <div className="relative -mt-12 grid gap-4 sm:-mt-16 sm:px-6 md:grid-cols-[1fr_320px] md:items-end">
        <header className="rounded-3xl border border-line bg-surface p-5 shadow-lift sm:p-6">
          <div className="flex items-start gap-4">
            <div className="size-18 shrink-0 overflow-hidden rounded-2xl border border-line bg-brand-50 shadow-soft sm:size-22">
              {p.logo ? (
                <Image src={p.logo.url} alt="" width={88} height={88} className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center bg-hero text-3xl font-black text-white">{p.displayName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">
                <span className="min-w-0 break-words">{p.displayName}</span>
                {verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">
                    <BadgeCheck aria-hidden className="size-3.5" />
                    {t.ui.home.verified}
                  </span>
                )}
              </h1>
              <div className="mt-1.5 text-sm">
                <RatingSummary avg={p.rating.avg} count={p.rating.count} t={t} />
              </div>
              {areaLabel && (
                <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
                  <MapPin aria-hidden className="size-4 shrink-0" />
                  <span>
                    {areaLabel}
                    {p.distance && ` · ${fill(t.location.away, { distance: formatDistance(p.distance.km, p.distance.precision) })}`}
                  </span>
                </p>
              )}
            </div>
          </div>
          {categoryLabel && <p className="mt-3 text-sm font-medium text-brand-700">{categoryLabel}</p>}
          {(badges.some((b) => b.kind !== "VERIFIED") || availText) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {availText && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${AVAIL_TONE[availText.tone]}`}>{availText.text}</span>}
              <TrustBadges badges={badges.filter((b) => b.kind !== "VERIFIED" && b.kind !== "AVAILABLE")} t={t} locale={locale} />
            </div>
          )}
          {p.isOwner && (
            <ButtonLink href="/provider/profile" variant="secondary" className="mt-4 min-h-9">
              <Pencil aria-hidden className="size-4" />
              {t.profile.public.editProfile}
            </ButtonLink>
          )}
        </header>

        {/* Contact buttons: only the ones the provider chose, and only when the data exists. */}
        <section aria-label={t.profile.public.contact} className="rounded-3xl border border-line bg-surface p-4 shadow-soft">
          {p.actions.length ? (
            <div className="grid grid-cols-2 gap-2">
              {p.actions.map(
                ({ action, href }, i) =>
                  href && (
                    <ConnectButton
                      key={action}
                      slug={p.slug}
                      action={action}
                      href={href}
                      label={t.profile.actions[action]}
                      source="PROFILE"
                      primary={i === 0 || action === "CALL"}
                      className={p.actions.length % 2 === 1 && i === p.actions.length - 1 ? "col-span-2" : ""}
                    />
                  ),
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{t.profile.public.noContact}</p>
          )}
          {customerView && (
            <div className="mt-3 hidden border-t border-line pt-3 md:block">
              {priceText && (
                <p className="mb-2 text-sm">
                  {fromLabel && <span className="text-ink-muted">{fromLabel} · </span>}
                  <span className="font-bold">{priceText}</span>
                </p>
              )}
              <ButtonLink href={requestHref} variant="night" className="w-full">
                {u.requestService}
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            </div>
          )}
          {/* Phase 12: report a listing (fake, fraud, unsafe…). The provider's own team doesn't see it. */}
          {!p.preview && !p.isOwner && viewer && (viewer.role === "CUSTOMER" || viewer.role === "PROVIDER") && (
            <div className="mt-2">
              <ReportButton targetType="PROVIDER" targetId={p.id} />
            </div>
          )}
        </section>
      </div>

      {/* Sticky jump bar */}
      <nav aria-label={u.sections} className="sticky top-16 z-10 -mx-4 mt-6 border-b border-line bg-canvas/90 px-4 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface/90">
        <ul className="flex gap-1 overflow-x-auto no-scrollbar">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex min-h-12 items-center px-3 text-sm font-semibold whitespace-nowrap text-ink-muted transition hover:text-ink">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card id="overview" className="scroll-mt-32">
            <h2 className="mb-2 text-lg font-bold">{t.profile.public.about}</h2>
            {p.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-line text-ink-muted">{p.description}</p>
            ) : (
              <p className="text-sm text-ink-subtle">—</p>
            )}
          </Card>

          <Card id="services" className="scroll-mt-32">
            <h2 className="mb-2 text-lg font-bold">{t.profile.public.services}</h2>
            <ul className="divide-y divide-line">
              {p.services.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                  <span className="font-medium">{name(s)}</span>
                  <span className={`shrink-0 text-right ${s.priceType === "ON_QUOTE" ? "text-ink-subtle" : "font-bold"}`}>{formatPrice(s, t.profile.priceLabels)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-subtle">{t.profile.public.pricesNote}</p>
          </Card>

          <Card id="reviews" className="scroll-mt-32">
            <h2 className="mb-1 flex items-center justify-between gap-3 text-lg font-bold">
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
                {reviewsPage > 1 ? (
                  <Link href={`?reviews=${reviewsPage - 1}#reviews`} className="font-semibold text-brand-700">
                    {t.trust.reviews.previous}
                  </Link>
                ) : (
                  <span />
                )}
                {reviewsPage < reviews.pages ? (
                  <Link href={`?reviews=${reviewsPage + 1}#reviews`} className="font-semibold text-brand-700">
                    {t.trust.reviews.next}
                  </Link>
                ) : (
                  <span />
                )}
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
            <Card id="photos" className="scroll-mt-32">
              <h2 className="mb-3 text-lg font-bold">{t.profile.public.photos}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {p.gallery.map((g, i) => (
                  <a
                    key={g.id}
                    href={g.url}
                    target="_blank"
                    rel="noopener"
                    className={`group relative overflow-hidden rounded-xl bg-canvas ${i === 0 && p.gallery.length > 2 ? "col-span-2 row-span-2 aspect-square sm:col-span-2" : "aspect-square"}`}
                  >
                    <Image src={g.url} alt="" fill sizes="(max-width: 640px) 50vw, 320px" className="object-cover transition duration-500 group-hover:scale-105" />
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <Card id="hours" className="scroll-mt-32">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <Clock aria-hidden className="size-4.5 text-brand-700" />
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
                    <div key={day} className={`flex justify-between rounded-lg px-2 py-1.5 ${day === today ? "bg-brand-50 font-semibold text-ink" : "text-ink-muted"}`}>
                      <dt>{day === today ? `${t.profile.days[day - 1]} (${t.profile.public.today})` : t.profile.days[day - 1]}</dt>
                      <dd>{rows.length ? rows.map((r) => `${minutesToTime(r.opensAt)}–${minutesToTime(r.closesAt)}`).join(", ") : t.profile.fields.closed}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
            {p.hoursNote && <p className="mt-2 text-xs text-ink-muted">{p.hoursNote}</p>}
          </Card>

          <Card id="location" className="scroll-mt-32">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <MapPin aria-hidden className="size-4.5 text-brand-700" />
              {t.profile.public.location}
            </h2>
            {areaLabel && <p className="text-sm">{areaLabel}</p>}
            {p.addressText && <p className="mt-1 text-sm text-ink-muted">{p.addressText}</p>}
            {p.mapPoint && (
              <div className="mt-3 overflow-hidden rounded-xl">
                {/* Public point only: exact pin, ~500 m circle, or the area circle (ADR-006). */}
                <MapView
                  center={p.mapPoint}
                  zoom={p.mapPoint.precision === "exact" ? 15 : 13}
                  markers={[{ id: "p", ...p.mapPoint, label: p.displayName }]}
                  you={point}
                  youLabel={t.location.you}
                  className="h-52"
                />
                {p.mapPoint.precision !== "exact" && <p className="mt-1.5 text-xs text-ink-subtle">{t.location.mapApproxLegend}</p>}
              </div>
            )}
            {p.serviceRadiusKm && <p className="mt-3 text-sm text-ink-muted">{fill(t.location.radiusKm, { km: p.serviceRadiusKm })}</p>}
            {p.serviceAreas.length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">{t.profile.public.serviceAreas}</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {p.serviceAreas.map((a) => (
                    <li key={a.id} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink-muted ring-1 ring-line">
                      {a.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          {p.socialLinks.length > 0 && (
            <Card>
              <h2 className="mb-2 text-lg font-bold">{t.profile.public.follow}</h2>
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

      {/* Phones: the price and "Request service" stay in reach, above the tab bar. */}
      {customerView && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-xl md:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            {priceText && (
              <div className="min-w-0">
                {fromLabel && <p className="text-[11px] text-ink-muted">{fromLabel}</p>}
                <p className="truncate text-base font-bold">{priceText}</p>
              </div>
            )}
            <ButtonLink href={requestHref} variant="night" className="flex-1">
              {u.requestService}
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}
