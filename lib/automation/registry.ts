import type { z } from "zod";

// Automation Engine (Phase B). A rule is defined in code — trigger, validated settings, action —
// and admins only switch it on/off and tune its settings within the schema's limits.
//
// Triggers:
//   { kind: "event", events }      runs once per matching event (idempotent per event id)
//   { kind: "schedule", every }    runs once per time slot, in Dar es Salaam time (EAT, UTC+3)

export type Schedule = "5m" | "hourly" | "daily@08:00" | "weekly@mon-08:00";
export type Trigger = { kind: "event"; events: string[] } | { kind: "schedule"; every: Schedule };

export type RuleContext<P> = {
  params: P;
  now: Date;
  /** The event that fired an event rule. */
  event?: { id: string; type: string; subjectType: string; subjectId: string; payload: Record<string, unknown> };
};

/** What a run reports back: counts for the run log ("sent 3 reminders"), never personal data. */
export type RuleResult = Record<string, number | string | boolean>;

export type AutomationRuleDef<P extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  /** Area in the Control Center. */
  group: "customers" | "providers" | "trust" | "trips" | "business" | "system";
  trigger: Trigger;
  enabledByDefault: boolean;
  params: z.ZodType<P>;
  /** Number inputs the admin form shows (limits mirror the schema; the server re-validates). */
  fields: { key: keyof P & string; min: number; max: number }[];
  defaults: P;
  run: (ctx: RuleContext<P>) => Promise<RuleResult>;
};

/** A rule with its settings type erased, for the registry list. The engine validates settings
 * with the rule's own schema before every run, so `run` always receives the right shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRule = AutomationRuleDef<any>;

export function defineRule<P extends Record<string, unknown>>(def: AutomationRuleDef<P>): AnyRule {
  return def;
}

// ─── Schedule slots (EAT, no daylight saving) ────────────────────────────────────────────────

const EAT_OFFSET_MS = 3 * 60 * 60_000;

/**
 * The slot a schedule is due for at `now`, or null when it isn't due yet today/this week.
 * Every trigger inside one slot maps to the same key, so the rule runs once per slot.
 */
export function slotFor(every: Schedule, now: Date): string | null {
  const eat = new Date(now.getTime() + EAT_OFFSET_MS); // read with getUTC* = wall clock in Dar
  const day = eat.toISOString().slice(0, 10);
  switch (every) {
    case "5m":
      return `5m:${Math.floor(now.getTime() / 300_000)}`;
    case "hourly":
      return `h:${eat.toISOString().slice(0, 13)}`;
    case "daily@08:00":
      return eat.getUTCHours() >= 8 ? `d:${day}` : null;
    case "weekly@mon-08:00": {
      // ISO week starting Monday; due from Monday 08:00 until the week ends.
      const dow = (eat.getUTCDay() + 6) % 7; // 0 = Monday
      if (dow === 0 && eat.getUTCHours() < 8) return null;
      const monday = new Date(eat.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
      return `w:${monday}`;
    }
  }
}
