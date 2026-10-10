// Request timeline (design wave 2): what has happened to a customer's request so far, from real
// timestamps only — no "viewed" step, because Go Big doesn't record views of a request.

export type TimelineKey = "posted" | "sent" | "replied" | "quoted" | "chosen" | "booked" | "done" | "cancelled" | "expired";
export type TimelineStep = { key: TimelineKey; state: "done" | "current" | "todo"; at: Date | null; count?: number };

export type TimelineInput = {
  createdAt: Date;
  effective: "OPEN" | "EXPIRED" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
  acceptedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date;
  matches: { notifiedAt: Date; firstResponseAt: Date | null }[];
  quotes: { createdAt: Date }[];
  booking: { status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED"; confirmedAt: Date | null } | null;
};

const earliest = (dates: Date[]): Date | null => (dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null);

export function requestTimeline(r: TimelineInput): TimelineStep[] {
  const replied = r.matches.filter((m) => m.firstResponseAt).map((m) => m.firstResponseAt!);
  const booked = r.booking && (r.booking.status === "CONFIRMED" || r.booking.status === "COMPLETED") ? (r.booking.confirmedAt ?? null) : null;
  const steps: { key: TimelineKey; at: Date | null; done: boolean; count?: number }[] = [
    { key: "posted", at: r.createdAt, done: true },
    { key: "sent", at: earliest(r.matches.map((m) => m.notifiedAt)), done: r.matches.length > 0, count: r.matches.length },
    { key: "replied", at: earliest(replied), done: replied.length > 0, count: replied.length },
    { key: "quoted", at: earliest(r.quotes.map((q) => q.createdAt)), done: r.quotes.length > 0, count: r.quotes.length },
    { key: "chosen", at: r.acceptedAt, done: !!r.acceptedAt },
    { key: "booked", at: booked, done: !!booked },
    { key: "done", at: r.completedAt, done: r.effective === "COMPLETED" },
  ];

  // A cancelled or expired request ends where it stopped: the steps it reached, then the end.
  if (r.effective === "CANCELLED" || r.effective === "EXPIRED") {
    const reached = steps.filter((s) => s.done && s.key !== "done");
    const end: TimelineStep = { key: r.effective === "CANCELLED" ? "cancelled" : "expired", state: "done", at: r.effective === "CANCELLED" ? r.cancelledAt : r.expiresAt };
    return [...reached.map((s) => ({ key: s.key, state: "done" as const, at: s.at, count: s.count })), end];
  }

  // Skipped optional steps (e.g. chosen without a quote) still count as passed once a later step is done.
  const lastDone = steps.map((s) => s.done).lastIndexOf(true);
  let currentSet = false;
  return steps.map((s, i) => {
    const done = s.done || i < lastDone;
    if (done) return { key: s.key, state: "done", at: s.done ? s.at : null, count: s.count };
    if (!currentSet) {
      currentSet = true;
      return { key: s.key, state: "current", at: null, count: s.count };
    }
    return { key: s.key, state: "todo", at: null, count: s.count };
  });
}
