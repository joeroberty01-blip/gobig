import { describe, expect, it } from "vitest";
import { slotFor } from "@/lib/automation/registry";
import { RULES } from "@/lib/automation/rules";

// Dar es Salaam is UTC+3 all year. 2026-09-28 is a Monday.
const at = (iso: string) => new Date(iso);

describe("schedule slots (Dar es Salaam time)", () => {
  it("5-minute and hourly slots are stable inside the window", () => {
    expect(slotFor("5m", at("2026-09-28T05:01:00Z"))).toBe(slotFor("5m", at("2026-09-28T05:04:59Z")));
    expect(slotFor("5m", at("2026-09-28T05:04:59Z"))).not.toBe(slotFor("5m", at("2026-09-28T05:05:00Z")));
    expect(slotFor("hourly", at("2026-09-28T05:10:00Z"))).toBe("h:2026-09-28T08");
  });

  it("daily@08:00 is due from 08:00 EAT (05:00 UTC)", () => {
    expect(slotFor("daily@08:00", at("2026-09-28T04:59:00Z"))).toBeNull();
    expect(slotFor("daily@08:00", at("2026-09-28T05:00:00Z"))).toBe("d:2026-09-28");
    // 23:30 EAT is still the same Dar day even though UTC is earlier.
    expect(slotFor("daily@08:00", at("2026-09-28T20:30:00Z"))).toBe("d:2026-09-28");
    // 00:30 EAT on the 29th is before 08:00 → not due yet that day.
    expect(slotFor("daily@08:00", at("2026-09-28T21:30:00Z"))).toBeNull();
  });

  it("weekly is keyed by the Monday and due from Monday 08:00 EAT", () => {
    expect(slotFor("weekly@mon-08:00", at("2026-09-28T04:00:00Z"))).toBeNull();
    expect(slotFor("weekly@mon-08:00", at("2026-09-28T05:00:00Z"))).toBe("w:2026-09-28");
    expect(slotFor("weekly@mon-08:00", at("2026-10-01T12:00:00Z"))).toBe("w:2026-09-28");
    expect(slotFor("weekly@mon-08:00", at("2026-10-05T06:00:00Z"))).toBe("w:2026-10-05");
  });
});

describe("rule definitions", () => {
  it("have unique ids, valid defaults and settings bounded by their schema", () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    for (const r of RULES) {
      expect(r.params.safeParse(r.defaults).success).toBe(true);
      for (const f of r.fields) {
        expect(r.params.safeParse({ ...r.defaults, [f.key]: f.max + 1 }).success).toBe(false);
        expect(r.params.safeParse({ ...r.defaults, [f.key]: f.min - 1 }).success).toBe(false);
      }
    }
  });

  it("keep the Phase 17 defaults (behaviour unchanged by the move)", () => {
    const byId = Object.fromEntries(RULES.map((r) => [r.id, r]));
    expect(byId["review.auto-hide"]).toMatchObject({ enabledByDefault: false });
    expect(byId["request.unanswered-reminder"]).toMatchObject({ enabledByDefault: false });
    expect(byId["driver.auto-offline"]).toMatchObject({ enabledByDefault: true, defaults: { afterMin: 30 } });
  });
});
