import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { CreateAdminForm } from "@/components/admin/CreateAdminForm";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.admin.addAdminTitle };
}

export default async function NewAdminPage() {
  await requirePageAccess("admins:create", "/admin/users/new");
  const { t } = await getServerDictionary();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t.admin.addAdminTitle} subtitle={t.admin.addAdminBody} />
      <Card>
        <CreateAdminForm />
      </Card>
    </div>
  );
}
