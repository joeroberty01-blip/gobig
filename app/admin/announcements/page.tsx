import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { listAnnouncements } from "@/lib/services/admin/oversight";
import { AnnouncementForm } from "@/components/admin/platform/Controls";
import { Alert, Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.announcements.title };
}

export default async function AdminAnnouncementsPage() {
  // Any admin can read the history; only a super admin can send.
  const actor = await requirePageAccess("admin-area:access", "/admin/announcements");
  const { t, locale } = await getServerDictionary();
  const a = t.adminPlatform.announcements;
  const list = await listAnnouncements();
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });
  const audience = { ALL: a.audienceALL, CUSTOMERS: a.audienceCUSTOMERS, PROVIDERS: a.audiencePROVIDERS };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title={a.title} subtitle={a.intro} />
      <Card>{can(actor, "announcements:send") ? <AnnouncementForm /> : <Alert tone="info">{t.adminPlatform.settings.superOnly}</Alert>}</Card>
      <h2 className="font-semibold">{a.history}</h2>
      {list.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{t.adminPlatform.common.none}</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((x) => (
            <li key={x.id}>
              <Card className="p-4">
                <p className="font-semibold">{locale === "sw" ? x.titleSw : x.titleEn}</p>
                <p className="mt-1 text-sm whitespace-pre-line text-ink-muted">{locale === "sw" ? x.bodySw : x.bodyEn}</p>
                <p className="mt-1 text-xs text-ink-subtle">
                  {date.format(x.createdAt)} · {audience[x.audience]} · {fill(a.recipients, { count: x.recipients })}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
