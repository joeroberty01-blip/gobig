import { describe, expect, it } from "vitest";
import { change, lastMonthStart, lastWeekStart, periodRange } from "@/lib/analytics/rollups";

// Phase G: periods are in Dar es Salaam time (UTC+3).
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("rollup periods", () => {
  it("last finished week is Monday–Sunday in Dar", () => {
    // Wednesday 1 Oct 2026, 10:00 in Dar → last week is Mon 21 – Sun 27 Sep.
    expect(iso(lastWeekStart(new Date("2026-10-01T07:00:00Z")))).toBe("2026-09-21");
    // Monday 5 Oct 01:00 in Dar (still Sunday 22:00 UTC) → the week of 28 Sep has just ended.
    expect(iso(lastWeekStart(new Date("2026-10-04T22:00:00Z")))).toBe("2026-09-28");
  });

  it("last finished month, across the year end", () => {
    expect(iso(lastMonthStart(new Date("2026-10-02T06:00:00Z")))).toBe("2026-09-01");
    expect(iso(lastMonthStart(new Date("2027-01-01T05:00:00Z")))).toBe("2026-12-01");
  });

  it("ranges end where the next period starts, at Dar midnight", () => {
    const w = periodRange("WEEK", new Date("2026-09-21T00:00:00Z"));
    expect(iso(w.end)).toBe("2026-09-28");
    expect(w.startTs.toISOString()).toBe("2026-09-20T21:00:00.000Z");
    expect(iso(periodRange("MONTH", new Date("2026-02-01T00:00:00Z")).end)).toBe("2026-03-01");
  });

  it("percentage change needs something to compare with", () => {
    expect(change(15, 10)).toBe(50);
    expect(change(5, 10)).toBe(-50);
    expect(change(5, 0)).toBeNull();
    expect(change(5, undefined)).toBeNull();
  });
});
