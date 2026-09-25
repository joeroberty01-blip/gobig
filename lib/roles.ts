export type Role = "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPER_ADMIN";

/** Roles a person may pick for themselves at sign-up. Admin roles are never self-assigned. */
export const SELF_SERVICE_ROLES = ["CUSTOMER", "PROVIDER"] as const;
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export function isAdminRole(role: Role): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Where a signed-in user lands after login. */
export function roleHome(role: Role): string {
  switch (role) {
    case "PROVIDER":
      return "/provider";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/admin";
    default:
      return "/";
  }
}

/**
 * Accepts only same-site relative paths as a post-login destination, so a crafted
 * ?callbackUrl= can't bounce the user to another site.
 */
export function safeCallbackPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
