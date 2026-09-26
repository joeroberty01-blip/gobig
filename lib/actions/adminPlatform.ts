"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { can, type Action } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import * as people from "@/lib/services/admin/people";
import * as catalog from "@/lib/services/admin/catalog";
import * as oversight from "@/lib/services/admin/oversight";
import { savePlatformSettings } from "@/lib/services/platformSettings";
import * as v from "@/lib/validators/admin";
import { invalidate } from "@/lib/cache";

// Phase 12 server actions: authenticate → can() → validate → service (audited).

type ErrorKey = keyof Dictionary["errors"];
export type AdminActionResult = { ok: true; message?: string } | { ok: false; error: ErrorKey; field?: string };

function invalid(error: z.ZodError): AdminActionResult {
  const issue = error.issues[0];
  return { ok: false, error: (issue?.message as ErrorKey) ?? "generic", field: issue?.path.map(String).join(".") };
}
const fail = (error: string): AdminActionResult => ({ ok: false, error: error as ErrorKey });

async function actor(action: Action) {
  const user = await getCurrentUser();
  return can(user, action) ? user! : null;
}

export async function setUserStatusAction(input: z.input<typeof v.userStatusSchema>): Promise<AdminActionResult> {
  const user = await actor("users:manage");
  if (!user) return fail("forbidden");
  const parsed = v.userStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await people.setUserStatus(user, parsed.data.id, parsed.data.status, parsed.data.reason);
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setProviderListingAction(input: z.input<typeof v.providerListingSchema>): Promise<AdminActionResult> {
  const user = await actor("providers:moderate");
  if (!user) return fail("forbidden");
  const parsed = v.providerListingSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await people.setProviderListing(user, parsed.data.id, parsed.data.action, parsed.data.reason);
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin", "layout");
  revalidatePath("/p/[slug]", "page");
  revalidatePath("/search");
  return { ok: true };
}

export async function saveCategoryAction(input: z.input<typeof v.categorySchema>): Promise<AdminActionResult> {
  const user = await actor("catalog:manage");
  if (!user) return fail("forbidden");
  const parsed = v.categorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...data } = parsed.data;
  const r = await catalog.saveCategory(user.id, id, data);
  if (!r.ok) return fail(r.error);
  invalidate("ref:");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveServiceAction(input: z.input<typeof v.serviceSchema>): Promise<AdminActionResult> {
  const user = await actor("catalog:manage");
  if (!user) return fail("forbidden");
  const parsed = v.serviceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...data } = parsed.data;
  const r = await catalog.saveService(user.id, id, data);
  if (!r.ok) return fail(r.error);
  invalidate("ref:");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveLocationAction(input: z.input<typeof v.locationSchema>): Promise<AdminActionResult> {
  const user = await actor("catalog:manage");
  if (!user) return fail("forbidden");
  const parsed = v.locationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...data } = parsed.data;
  const r = await catalog.saveLocation(user.id, id, data);
  if (!r.ok) return fail(r.error);
  invalidate("ref:");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function adminCancelRequestAction(input: z.input<typeof v.cancelRequestSchema>): Promise<AdminActionResult> {
  const user = await actor("requests:oversee");
  if (!user) return fail("forbidden");
  const parsed = v.cancelRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await oversight.adminCancelRequest(user.id, parsed.data.id, parsed.data.reason);
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin/requests");
  return { ok: true };
}

/** Customers and providers report a provider, a request or a conversation. */
export async function fileReportAction(input: z.input<typeof v.fileReportSchema>): Promise<AdminActionResult> {
  const user = await actor("reports:file");
  if (!user) return fail("forbidden");
  const parsed = v.fileReportSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await hit(LIMITS.reportPerUser, user.id)).ok) return fail("rateLimited");
  const r = await oversight.fileReport(user, parsed.data);
  if (!r.ok) return fail(r.error === "notFound" ? "notAllowed" : r.error);
  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function resolveReportAction(input: z.input<typeof v.resolveReportSchema>): Promise<AdminActionResult> {
  const user = await actor("reports:manage");
  if (!user) return fail("forbidden");
  const parsed = v.resolveReportSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await oversight.resolveReport(user.id, parsed.data.id, parsed.data.outcome, parsed.data.resolution);
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function sendAnnouncementAction(input: z.input<typeof v.announcementSchema>): Promise<AdminActionResult> {
  const user = await actor("announcements:send");
  if (!user) return fail("forbidden");
  const parsed = v.announcementSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await oversight.sendAnnouncement(user.id, parsed.data);
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin/announcements");
  return { ok: true, message: String(r.recipients) };
}

export async function savePlatformSettingsAction(input: z.input<typeof v.platformSettingsSchema>): Promise<AdminActionResult> {
  const user = await actor("settings:manage");
  if (!user) return fail("forbidden");
  const parsed = v.platformSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await savePlatformSettings(user.id, parsed.data);
  revalidatePath("/", "layout");
  return { ok: true };
}
