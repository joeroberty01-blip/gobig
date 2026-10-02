import type { Locale } from "./dictionaries";

// Admin "Risk flags" screen (Automation Engine, Phase F). Server-only, so it stays out of the
// dictionary sent to customers' browsers.

const en = {
  title: "Risk flags",
  intro: "Unusual activity found by the trust rules. Flags never ban, hide or change anything — you decide.",
  tabs: { OPEN: "Open", ACTIONED: "Handled", DISMISSED: "Dismissed" },
  severity: { LOW: "Low", MEDIUM: "Medium", HIGH: "High" },
  kinds: {
    REVIEW_BURST: "{count} reviews in {hours} hours",
    NEW_ACCOUNT_REVIEWS: "{count} reviews from accounts under {accountDays} days old",
    REQUEST_SPAM: "{count} requests in one day",
    MESSAGE_SPAM: "{count} messages in one hour",
    REPEATED_REPORTS: "Reported by {count} different people in 30 days",
    TRIP_CANCELLATIONS: "Cancelled {count} trips in one day",
    VERIFICATION_EXPIRING: "Verification ends on {expiresAt}",
    VERIFICATION_EXPIRED: "Verification ended on {expiredAt}",
  },
  subject: { PROVIDER: "Business", USER: "Account" },
  open: "Open",
  handled: "Mark handled",
  dismiss: "Dismiss",
  note: "Note (what you checked or did)",
  noteHint: "At least 3 characters. Kept in the audit log.",
  resolvedBy: "Closed {date}",
  none: "Nothing to look at.",
  rulesLink: "Tune the trust rules",
  error: "Couldn't save. Please try again.",
};

const sw: typeof en = {
  title: "Alama za hatari",
  intro: "Shughuli zisizo za kawaida zilizogunduliwa na kanuni za uaminifu. Alama hazizuii, hazifichi wala kubadilisha chochote — wewe ndiye unaamua.",
  tabs: { OPEN: "Zilizo wazi", ACTIONED: "Zimeshughulikiwa", DISMISSED: "Zimepuuzwa" },
  severity: { LOW: "Chini", MEDIUM: "Wastani", HIGH: "Juu" },
  kinds: {
    REVIEW_BURST: "Maoni {count} ndani ya saa {hours}",
    NEW_ACCOUNT_REVIEWS: "Maoni {count} kutoka akaunti zenye chini ya siku {accountDays}",
    REQUEST_SPAM: "Maombi {count} kwa siku moja",
    MESSAGE_SPAM: "Jumbe {count} kwa saa moja",
    REPEATED_REPORTS: "Imeripotiwa na watu {count} tofauti ndani ya siku 30",
    TRIP_CANCELLATIONS: "Imeghairi safari {count} kwa siku moja",
    VERIFICATION_EXPIRING: "Uthibitisho unaisha {expiresAt}",
    VERIFICATION_EXPIRED: "Uthibitisho uliisha {expiredAt}",
  },
  subject: { PROVIDER: "Biashara", USER: "Akaunti" },
  open: "Fungua",
  handled: "Weka imeshughulikiwa",
  dismiss: "Puuza",
  note: "Maelezo (ulichoangalia au kufanya)",
  noteHint: "Angalau herufi 3. Huhifadhiwa kwenye kumbukumbu za ukaguzi.",
  resolvedBy: "Imefungwa {date}",
  none: "Hakuna cha kuangalia.",
  rulesLink: "Rekebisha kanuni za uaminifu",
  error: "Imeshindikana kuhifadhi. Jaribu tena.",
};

export const riskText = (locale: Locale) => (locale === "sw" ? sw : en);
export type RiskText = typeof en;
