import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { getAreaOptions, getCategoryOptions, getEditorData, getServiceOptions } from "@/lib/data/provider";
import { isSetupStep, prevStep, SETUP_STEPS, type SetupStep } from "@/lib/provider/steps";
import { CONNECT_ACTIONS, isActionAvailable, type ConnectAction } from "@/lib/provider/connect";
import { ContactStep, DescriptionStep, NameStep, WhatsappStep } from "@/components/provider/setup/BasicSteps";
import { CategoryStep, ServicesStep } from "@/components/provider/setup/CatalogSteps";
import { AreasStep, LocationStep } from "@/components/provider/setup/LocationSteps";
import { ActionsStep, HoursStep, OnlineStep, PricingStep } from "@/components/provider/setup/DetailSteps";
import { PhotosStep } from "@/components/provider/setup/PhotosStep";
import { CompletionBar, CompletionChecklist } from "@/components/provider/Completion";
import { PublishControls } from "@/components/provider/PublishControls";
import { Alert, ButtonLink } from "@/components/ui";
import { galleryLimitFor } from "@/lib/services/billing";

type Props = { params: Promise<{ step: string }>; searchParams: Promise<{ edit?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { step } = await params;
  const { t } = await getServerDictionary();
  return { title: isSetupStep(step) ? t.profile.steps[step].title : t.provider.dashboardTitle };
}

export default async function SetupStepPage({ params, searchParams }: Props) {
  const { step } = await params;
  if (!isSetupStep(step)) notFound();
  const editMode = (await searchParams).edit === "1";
  const user = await requirePageAccess("provider-area:access", `/provider/setup/${step}`);
  const { t } = await getServerDictionary();

  const providerId = await getOwnedProviderId(user.id);
  // Everything hangs off the business record, which the name step creates.
  if (!providerId && step !== "name") redirect("/provider/setup/name");
  const data = providerId ? await getEditorData(providerId) : null;
  const profile = data?.profile;

  const index = SETUP_STEPS.indexOf(step);
  const back = editMode ? "/provider" : prevStep(step) ? `/provider/setup/${prevStep(step)}` : "/provider";
  const props = { step, editMode };

  const body = await (async (s: SetupStep) => {
    switch (s) {
      case "name":
        return <NameStep {...props} initial={profile?.displayName ?? ""} />;
      case "category":
        return <CategoryStep {...props} options={await getCategoryOptions()} initial={profile?.primaryCategoryId ?? null} />;
      case "services":
        return (
          <ServicesStep
            {...props}
            groups={await getServiceOptions()}
            primaryCategoryId={profile?.primaryCategoryId ?? null}
            initial={data!.services.map((x) => x.serviceId)}
          />
        );
      case "description":
        return <DescriptionStep {...props} initial={profile?.description ?? ""} />;
      case "contact":
        // First visit: start from the phone/email on the account.
        return <ContactStep {...props} phone={profile?.phone ?? user.phone} email={profile?.email ?? null} />;
      case "whatsapp":
        return <WhatsappStep {...props} whatsapp={profile?.whatsapp ?? null} phone={profile?.phone ?? null} />;
      case "online":
        return <OnlineStep {...props} website={profile?.website ?? null} social={data!.socialLinks} />;
      case "location":
        return (
          <LocationStep
            {...props}
            districts={await getAreaOptions()}
            initial={{
              locationId: profile?.primaryLocationId ?? null,
              addressText: profile?.addressText ?? null,
              visibility: profile?.locationVisibility ?? "AREA_ONLY",
              latitude: profile?.latitude ?? null,
              longitude: profile?.longitude ?? null,
              radiusKm: profile?.serviceRadiusKm ?? null,
            }}
          />
        );
      case "areas":
        return <AreasStep {...props} districts={await getAreaOptions()} initial={data!.serviceAreas.map((a) => a.locationId)} />;
      case "hours":
        return <HoursStep {...props} mode={profile?.openingHoursMode ?? "SCHEDULE"} note={profile?.hoursNote ?? null} hours={data!.openingHours} />;
      case "pricing":
        return data!.services.length ? (
          <PricingStep {...props} services={data!.services} />
        ) : (
          <Alert tone="info">
            {t.errors.servicesRequired}{" "}
            <Link href="/provider/setup/services" className="font-semibold underline">
              {t.profile.steps.services.title}
            </Link>
          </Alert>
        );
      case "photos":
        return <PhotosStep {...props} media={data!.media} maxGallery={await galleryLimitFor(providerId!)} />;
      case "actions": {
        const src = { ...profile!, areaName: profile!.primaryLocation?.name ?? null };
        const available = Object.fromEntries(CONNECT_ACTIONS.map((a) => [a, isActionAvailable(a, src)])) as Record<ConnectAction, boolean>;
        return <ActionsStep {...props} enabled={profile!.enabledActions} available={available} bookingUrl={profile!.bookingUrl} rideUrl={profile!.rideUrl} />;
      }
      case "review":
        return (
          <div className="flex flex-col gap-6">
            <CompletionBar percent={data!.completion.percent} t={t} />
            {data!.status === "ACTIVE" && <Alert tone="success">{t.profile.dashboard.published}</Alert>}
            <PublishControls status={data!.status} canPublish={data!.completion.canPublish} />
            <ButtonLink href={`/p/${data!.slug}`} variant="secondary">
              {data!.status === "ACTIVE" ? t.profile.dashboard.viewProfile : t.profile.dashboard.previewProfile}
            </ButtonLink>
            <CompletionChecklist completion={data!.completion} t={t} />
          </div>
        );
    }
  })(step);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={back} className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {editMode ? t.profile.setup.backToDashboard : t.profile.setup.back}
      </Link>
      {!editMode && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
            {fill(t.profile.setup.stepOf, { n: index + 1, total: SETUP_STEPS.length })}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-brand-500" style={{ width: `${((index + 1) / SETUP_STEPS.length) * 100}%` }} />
          </div>
        </div>
      )}
      <h1 className="text-2xl font-bold tracking-tight">{t.profile.steps[step].title}</h1>
      <p className="mt-1.5 mb-6 text-sm text-ink-muted">{t.profile.steps[step].hint}</p>
      {body}
    </div>
  );
}
