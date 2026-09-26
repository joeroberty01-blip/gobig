import type { Role } from "@/lib/roles";

/**
 * Single source of truth for "who may do what" (docs/PHASE-0-ARCHITECTURE.md §4).
 * Every server action and route handler calls can(); hiding a button is never the check.
 * Ownership (which provider/review) is checked separately in the service layer.
 */
export type Action =
  | "account:view"
  | "provider-area:access"
  | "provider:edit-own"
  | "admin-area:access"
  | "admins:create"
  // Phase 5
  | "verification:request"
  | "verification:review"
  | "verification:configure"
  | "review:write"
  | "review:respond"
  | "review:report"
  | "reviews:moderate"
  // Phase 7
  | "requests:create"
  | "requests:respond"
  | "notifications:view"
  // Phase 8
  | "ranking:configure"
  // Phase 10
  | "favorites:use"
  | "analytics:view-own"
  // Phase 11
  | "billing:manage-own"
  | "billing:manage"
  | "billing:configure"
  // Phase 12
  | "users:manage"
  | "providers:moderate"
  | "catalog:manage"
  | "requests:oversee"
  | "reports:manage"
  | "reports:file"
  | "announcements:send"
  | "audit:view"
  | "analytics:platform"
  | "settings:manage"
  // Phase 13
  | "security:manage-own"
  // Phase 17
  | "trips:request"
  | "trips:drive"
  | "trips:oversee";

export type Actor = { id: string; role: Role; status: "ACTIVE" | "SUSPENDED"; mfaPending?: boolean };

const RULES: Record<Action, readonly Role[]> = {
  "account:view": ["CUSTOMER", "PROVIDER", "ADMIN", "SUPER_ADMIN"],
  "provider-area:access": ["PROVIDER"],
  "provider:edit-own": ["PROVIDER"],
  "admin-area:access": ["ADMIN", "SUPER_ADMIN"],
  "admins:create": ["SUPER_ADMIN"],
  // Providers ask; only admins decide. Tier definitions are platform policy → super admin.
  "verification:request": ["PROVIDER"],
  "verification:review": ["ADMIN", "SUPER_ADMIN"],
  "verification:configure": ["SUPER_ADMIN"],
  // Only customers review (providers can't review competitors; admins moderate instead).
  "review:write": ["CUSTOMER"],
  "review:respond": ["PROVIDER"],
  "review:report": ["CUSTOMER", "PROVIDER"],
  "reviews:moderate": ["ADMIN", "SUPER_ADMIN"],
  // Customers post requests; providers answer the ones they were matched to (ownership in the service).
  "requests:create": ["CUSTOMER"],
  "requests:respond": ["PROVIDER"],
  "notifications:view": ["CUSTOMER", "PROVIDER", "ADMIN", "SUPER_ADMIN"],
  // Organic ranking weights (audited). Paid placement is never configured here.
  "ranking:configure": ["ADMIN", "SUPER_ADMIN"],
  "favorites:use": ["CUSTOMER"],
  "analytics:view-own": ["PROVIDER"],
  // Providers request plans/campaigns for their own business; admins record payments and run
  // campaigns; prices, plan features and platform switches are policy → super admin only.
  "billing:manage-own": ["PROVIDER"],
  "billing:manage": ["ADMIN", "SUPER_ADMIN"],
  "billing:configure": ["SUPER_ADMIN"],
  // Admin platform. Changing another admin's account is further limited to super admins in the service.
  "users:manage": ["ADMIN", "SUPER_ADMIN"],
  "providers:moderate": ["ADMIN", "SUPER_ADMIN"],
  "catalog:manage": ["ADMIN", "SUPER_ADMIN"],
  "requests:oversee": ["ADMIN", "SUPER_ADMIN"],
  "reports:manage": ["ADMIN", "SUPER_ADMIN"],
  "reports:file": ["CUSTOMER", "PROVIDER"],
  "trips:request": ["CUSTOMER"],
  "trips:drive": ["PROVIDER"],
  "trips:oversee": ["ADMIN", "SUPER_ADMIN"],
  // Messages to every user, and platform-wide limits, are policy → super admin only.
  "announcements:send": ["SUPER_ADMIN"],
  "audit:view": ["ADMIN", "SUPER_ADMIN"],
  "analytics:platform": ["ADMIN", "SUPER_ADMIN"],
  "settings:manage": ["SUPER_ADMIN"],
  // Setting up / managing one's own two-factor.
  "security:manage-own": ["ADMIN", "SUPER_ADMIN"],
};

/** What an admin whose session hasn't passed two-factor may still do (Phase 13, SEC-042). */
const MFA_PENDING_ALLOWED: ReadonlySet<Action> = new Set(["account:view", "security:manage-own"]);

export function can(actor: Actor | null | undefined, action: Action): boolean {
  if (!actor || actor.status !== "ACTIVE") return false;
  // Checked here — not only in proxy.ts — because a server action can be posted to any URL.
  if (actor.mfaPending && !MFA_PENDING_ALLOWED.has(action)) return false;
  return RULES[action].includes(actor.role);
}
