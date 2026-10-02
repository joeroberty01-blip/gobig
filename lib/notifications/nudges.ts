import type { NotificationType } from "@/lib/services/notifications";

/** Business nudges with no request attached: each opens a fixed page (in-app, push and email). */
export const NUDGE_HREF: Partial<Record<NotificationType, string>> = {
  REVIEW_REPLY_REMINDER: "/provider/reviews",
  PROFILE_INCOMPLETE: "/provider/setup",
  PROVIDER_INACTIVE: "/provider/requests",
  // Phase F
  VERIFICATION_EXPIRING: "/provider/verification",
  VERIFICATION_EXPIRED: "/provider/verification",
};
