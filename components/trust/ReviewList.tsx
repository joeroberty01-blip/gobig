import { BadgeCheck } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/dictionaries";
import { Stars } from "./TrustBadges";
import { ReportButton } from "./ReviewForms";

type Review = {
  id: string;
  rating: number;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  authorName: string;
  /** Set by the server from a completed NEXA request (never by the reviewer). */
  verifiedJob?: boolean;
  response: { body: string } | null;
};

/** Published reviews. Text is rendered as plain text (React escapes it) — never as HTML. */
export function ReviewList({
  reviews,
  providerName,
  t,
  locale,
  canReport,
  ownReviewId = null,
}: {
  reviews: Review[];
  providerName: string;
  t: Dictionary;
  locale: Locale;
  canReport: boolean;
  /** The viewer's own review: no Report button on it (the server refuses that report anyway). */
  ownReviewId?: string | null;
}) {
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium" });
  return (
    <ul className="divide-y divide-line">
      {reviews.map((r) => (
        <li key={r.id} className="py-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Stars value={r.rating} />
            <span className="font-semibold">{r.authorName}</span>
            {r.verifiedJob && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                <BadgeCheck aria-hidden className="size-3.5" />
                {t.trust.reviews.verifiedJob}
              </span>
            )}
            <span className="text-ink-subtle">
              · {date.format(r.createdAt)}
              {r.editedAt && ` · ${t.trust.reviews.edited}`}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-muted">{r.body}</p>
          {r.response && (
            <div className="mt-3 rounded-xl bg-canvas p-3 text-sm">
              <p className="mb-1 text-xs font-semibold text-ink">{fill(t.trust.reviews.response, { name: providerName })}</p>
              <p className="whitespace-pre-line text-ink-muted">{r.response.body}</p>
            </div>
          )}
          {canReport && r.id !== ownReviewId && (
            <div className="mt-1">
              <ReportButton reviewId={r.id} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
