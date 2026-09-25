// "Open now" from a provider's own hours, in Dar es Salaam time (UTC+3, no daylight saving).
// Pure: pass `now` in tests.

export type Availability =
  | { state: "OPEN"; closesAt: number }
  | { state: "CLOSED"; opensAt: { day: number; minute: number } | null }
  | { state: "ALWAYS" }
  | { state: "APPOINTMENT" }
  | { state: "UNKNOWN" };

const DAR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Day (1 = Monday … 7 = Sunday) and minute of day in Dar es Salaam. */
export function darClock(now: Date = new Date()): { day: number; minute: number } {
  const d = new Date(now.getTime() + DAR_OFFSET_MS);
  const js = d.getUTCDay();
  return { day: js === 0 ? 7 : js, minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function availability(
  mode: "SCHEDULE" | "ALWAYS_OPEN" | "BY_APPOINTMENT",
  hours: { dayOfWeek: number; opensAt: number; closesAt: number }[],
  now: Date = new Date(),
): Availability {
  if (mode === "ALWAYS_OPEN") return { state: "ALWAYS" };
  if (mode === "BY_APPOINTMENT") return { state: "APPOINTMENT" };
  if (hours.length === 0) return { state: "UNKNOWN" };

  const { day, minute } = darClock(now);
  const open = hours.find((h) => h.dayOfWeek === day && h.opensAt <= minute && minute < h.closesAt);
  if (open) return { state: "OPEN", closesAt: open.closesAt };

  // Next opening within the coming week: later today first, then the following days.
  for (let offset = 0; offset < 7; offset++) {
    const d = ((day - 1 + offset) % 7) + 1;
    const next = hours
      .filter((h) => h.dayOfWeek === d && (offset > 0 || h.opensAt > minute))
      .sort((a, b) => a.opensAt - b.opensAt)[0];
    if (next) return { state: "CLOSED", opensAt: { day: d, minute: next.opensAt } };
  }
  return { state: "CLOSED", opensAt: null };
}

/** Available now = open by schedule or always open. Appointment-only and unknown are not "now". */
export function isAvailableNow(a: Availability): boolean {
  return a.state === "OPEN" || a.state === "ALWAYS";
}
