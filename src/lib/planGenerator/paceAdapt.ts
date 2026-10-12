/**
 * Pace adaptation, nudge the runner's VMA from how the hard sessions went.
 *
 * `adapt.ts` adjusts weekly VOLUME from completion and RPE. This module
 * adjusts the PACE TARGETS: when the tempo and interval work keeps coming in
 * faster or slower than prescribed, the VMA behind every pace is moved a
 * little, and the paces follow.
 *
 * Deliberately conservative:
 * - it only SUGGESTS, the caller decides whether to apply;
 * - it needs several quality sessions before it says anything;
 * - it moves half of the gap, never more than 2 % up or 4 % down per step,
 *   so a good week cannot ratchet the targets up quickly;
 * - it never raises targets when the same sessions felt very hard (RPE).
 *
 * Input is the runner's own record: `actualWorkPaceMinKm` on a completed
 * session, the average pace of the hard part only.
 */

import type { PlanSession, PlanWeek, TrainingPlan } from "@/types/plan";
import {
  calculateTrainingPaces,
  sessionTypeToIntensity,
  type DanielsIntensity,
} from "./paceEngine";

/** Quality sessions with a single, comparable target pace. Fartlek and hills vary too much. */
const QUALITY_SESSION_TYPES: ReadonlySet<string> = new Set([
  "tempo",
  "threshold",
  "vo2max",
  "intervals",
  "speed",
  "race_specific",
]);

export const PACE_ADAPT = {
  /** How many recent weeks to look at, current week included. */
  windowWeeks: 3,
  /** Quality sessions needed before a suggestion is made. */
  minSamples: 3,
  /** Median faster than target by more than this (fraction) suggests a raise. */
  fasterThreshold: 0.02,
  /** Median slower than target by more than this (fraction) suggests a cut. */
  slowerThreshold: 0.03,
  /** Largest single raise of the VMA, as a fraction. */
  maxIncrease: 0.02,
  /** Largest single cut of the VMA, as a fraction. */
  maxDecrease: 0.04,
  /** Average RPE at or above this blocks any raise. */
  fatigueRpe: 8,
} as const;

export type VmaAdjustmentReason =
  | "faster_than_target"
  | "slower_than_target"
  | "on_target"
  | "not_enough_data"
  | "fatigue_guard";

export interface VmaAdjustment {
  reason: VmaAdjustmentReason;
  currentVma: number;
  suggestedVma: number;
  /** Signed change in percent, for example 1.5 or -2. */
  changePercent: number;
  sampleSize: number;
  /**
   * Median of (actual - target) / target, in percent. Negative means the runner
   * was faster than the target. Null when there were no usable sessions.
   */
  medianDeviationPercent: number | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function isCompleted(session: PlanSession): boolean {
  return session.status === "completed" || session.status === "modified";
}

/**
 * Suggest a VMA adjustment from the quality sessions of the last few weeks.
 * Pure: the plan is not modified.
 */
export function suggestVmaAdjustment(
  plan: TrainingPlan,
  currentWeekNumber: number,
): VmaAdjustment {
  const { config } = plan;
  const paces = calculateTrainingPaces(config.vma, config.runnerLevel);
  const currentVma = paces.vma;

  const firstWeek = Math.max(1, currentWeekNumber - PACE_ADAPT.windowWeeks + 1);
  const deviations: number[] = [];
  const rpes: number[] = [];

  for (const week of plan.weeks) {
    if (week.weekNumber < firstWeek || week.weekNumber > currentWeekNumber) continue;
    for (const session of week.sessions) {
      if (!isCompleted(session)) continue;
      if (!QUALITY_SESSION_TYPES.has(session.sessionType)) continue;
      const actual = session.actualWorkPaceMinKm;
      if (!actual || actual <= 0) continue;

      const intensity: DanielsIntensity = sessionTypeToIntensity(
        session.sessionType,
        config.raceDistance,
      );
      const range = paces[intensity];
      const target = (range.min + range.max) / 2;
      deviations.push((actual - target) / target);
      if (session.rpe) rpes.push(session.rpe);
    }
  }

  const base: Omit<VmaAdjustment, "reason" | "suggestedVma" | "changePercent"> = {
    currentVma,
    sampleSize: deviations.length,
    medianDeviationPercent: null,
  };

  if (deviations.length < PACE_ADAPT.minSamples) {
    return { ...base, reason: "not_enough_data", suggestedVma: currentVma, changePercent: 0 };
  }

  const med = median(deviations);
  const medianDeviationPercent = round1(med * 100);
  const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

  // Faster than target: a smaller pace number, so the VMA should go up.
  if (med < -PACE_ADAPT.fasterThreshold) {
    if (avgRpe !== null && avgRpe >= PACE_ADAPT.fatigueRpe) {
      return {
        ...base,
        medianDeviationPercent,
        reason: "fatigue_guard",
        suggestedVma: currentVma,
        changePercent: 0,
      };
    }
    const step = Math.min(Math.abs(med) / 2, PACE_ADAPT.maxIncrease);
    return {
      ...base,
      medianDeviationPercent,
      reason: "faster_than_target",
      suggestedVma: round1(currentVma * (1 + step)),
      changePercent: round1(step * 100),
    };
  }

  // Slower than target: the VMA should come down.
  if (med > PACE_ADAPT.slowerThreshold) {
    const step = Math.min(med / 2, PACE_ADAPT.maxDecrease);
    return {
      ...base,
      medianDeviationPercent,
      reason: "slower_than_target",
      suggestedVma: round1(currentVma * (1 - step)),
      changePercent: round1(-step * 100),
    };
  }

  return {
    ...base,
    medianDeviationPercent,
    reason: "on_target",
    suggestedVma: currentVma,
    changePercent: 0,
  };
}

const PACE_NOTE_ZONES: ReadonlySet<string> = new Set(["E", "M", "T", "I", "R"]);

function rewriteFutureWeek(week: PlanWeek, vma: number, plan: TrainingPlan): void {
  const paces = calculateTrainingPaces(vma, plan.config.runnerLevel);
  for (const session of week.sessions) {
    if (session.status && session.status !== "planned") continue;
    if (!session.paceNotes) continue;
    for (const note of session.paceNotes) {
      if (!PACE_NOTE_ZONES.has(note.zone)) continue;
      const range = paces[note.zone as DanielsIntensity];
      note.paceMinKm = range.min;
      note.paceMaxKm = range.max;
    }
  }
}

/**
 * Return a copy of the plan with the new VMA, and the structured pace notes of
 * the weeks after `currentWeekNumber` recomputed from it.
 *
 * Known limit: the free-text `notes` of a session were written at generation
 * time and still quote the old paces. Read paces from `paceNotes`.
 */
export function applyVmaAdjustment(
  plan: TrainingPlan,
  newVma: number,
  currentWeekNumber: number,
): TrainingPlan {
  const draft = structuredClone(plan);
  draft.config.vma = newVma;
  for (const week of draft.weeks) {
    if (week.weekNumber > currentWeekNumber) rewriteFutureWeek(week, newVma, draft);
  }
  return draft;
}
