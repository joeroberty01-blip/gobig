import { describe, expect, it } from "vitest";
import { requestTimeline, type TimelineInput } from "@/lib/requests/timeline";

// Design wave 2: the customer's request timeline is built from real timestamps only.
const at = (h: number) => new Date(Date.UTC(2026, 9, 10, h));
const base: TimelineInput = {
  createdAt: at(8),
  effective: "OPEN",
  acceptedAt: null,
  completedAt: null,
  cancelledAt: null,
  expiresAt: at(32),
  matches: [],
  quotes: [],
  booking: null,
};
const states = (r: TimelineInput) => requestTimeline(r).map((s) => `${s.key}:${s.state}`);

describe("request timeline", () => {
  it("a new request waits to be sent", () => {
    expect(states(base)).toEqual(["posted:done", "sent:current", "replied:todo", "quoted:todo", "chosen:todo", "booked:todo", "done:todo"]);
  });

  it("counts businesses sent to and replies, with the earliest time", () => {
    const steps = requestTimeline({ ...base, matches: [{ notifiedAt: at(9), firstResponseAt: at(11) }, { notifiedAt: at(9), firstResponseAt: null }, { notifiedAt: at(10), firstResponseAt: at(10) }] });
    expect(steps[1]).toMatchObject({ key: "sent", state: "done", count: 3, at: at(9) });
    expect(steps[2]).toMatchObject({ key: "replied", state: "done", count: 2, at: at(10) });
    expect(steps[3]).toMatchObject({ key: "quoted", state: "current" });
  });

  it("a business chosen without a quote marks the quote step passed, without a time", () => {
    const steps = requestTimeline({ ...base, effective: "ACCEPTED", acceptedAt: at(12), matches: [{ notifiedAt: at(9), firstResponseAt: at(10) }] });
    expect(steps.find((s) => s.key === "quoted")).toMatchObject({ state: "done", at: null });
    expect(steps.find((s) => s.key === "booked")).toMatchObject({ state: "current" });
  });

  it("a cancelled request ends at cancellation", () => {
    expect(states({ ...base, effective: "CANCELLED", cancelledAt: at(13), matches: [{ notifiedAt: at(9), firstResponseAt: null }] })).toEqual(["posted:done", "sent:done", "cancelled:done"]);
  });

  it("a completed job shows every step done", () => {
    const r: TimelineInput = { ...base, effective: "COMPLETED", acceptedAt: at(12), completedAt: at(20), matches: [{ notifiedAt: at(9), firstResponseAt: at(10) }], quotes: [{ createdAt: at(11) }], booking: { status: "COMPLETED", confirmedAt: at(13) } };
    expect(requestTimeline(r).every((s) => s.state === "done")).toBe(true);
  });
});
