/**
 * Pure builder behind the Apple Watch export. No DOM, no download, so it can be
 * unit tested. See `appleWorkout.ts` for the file-format notes.
 */

import type { TimelineSegment } from "@/components/visualization/types";
import {
  calculateTrainingPaces,
  getPaceForZone,
  type TrainingPaces,
} from "@/lib/planGenerator/paceEngine";

export type WorkoutKit = typeof import("@bibixx/workoutkit");

export interface AppleWorkoutOptions {
  /** Maximal aerobic speed in km/h. Without it, no pace alerts are written. */
  vma?: number;
  /** Multiplier applied to every pace target, for example 1.04 for a hot day. */
  paceFactor?: number;
  /** Indoor run on a treadmill. */
  treadmill?: boolean;
  /**
   * Which pace the Watch compares with the range. "current" reacts within
   * seconds, "average" is smoother but slow to flag a fast start in a long
   * step. Defaults to "current".
   */
  alertMetric?: AlertMetric;
}

export type AlertMetric = "current" | "average";

export const DEFAULT_ALERT_METRIC: AlertMetric = "current";

/** Pace range of a zone in seconds per km, slowest first, with the heat factor applied. */
function paceRangeSeconds(
  zone: number,
  paces: TrainingPaces,
  factor: number,
): { slow: number; fast: number } {
  const range = getPaceForZone(zone, paces);
  return {
    slow: Math.round(range.max * factor * 60),
    fast: Math.round(range.min * factor * 60),
  };
}

/** Turn timeline segments into a WorkoutKit plan. */
export function segmentsToAppleWorkout(
  kit: WorkoutKit,
  segments: TimelineSegment[],
  name: string,
  options: AppleWorkoutOptions = {},
) {
  const { WorkoutPlan, Step, TimeGoal, Duration, Distance, Speed, SpeedRangeAlert } = kit;
  const factor = options.paceFactor ?? 1;
  const metric = options.alertMetric ?? DEFAULT_ALERT_METRIC;
  const paces = options.vma ? calculateTrainingPaces(options.vma) : null;

  const plan = new WorkoutPlan({ referenceId: crypto.randomUUID() });
  const custom = plan.asCustom({
    activity: "running",
    location: options.treadmill ? "indoor" : "outdoor",
    displayName: name.substring(0, 64),
  });

  const goalFor = (seg: TimelineSegment) =>
    new TimeGoal(new Duration(Math.max(1, Math.round(seg.durationMin * 60)), "seconds"));

  const warmups = segments.filter((s) => s.type === "warmup");
  const cooldowns = segments.filter((s) => s.type === "cooldown");
  const main = segments.filter((s) => s.type !== "warmup" && s.type !== "cooldown");

  // A slower pace is a lower speed, so the slow end is the minimum.
  const alertFor = (zone: number) => {
    if (!paces) return undefined;
    const { slow, fast } = paceRangeSeconds(zone, paces, factor);
    return new SpeedRangeAlert(
      new Speed(new Distance(1, "kilometers"), new Duration(slow, "seconds")),
      new Speed(new Distance(1, "kilometers"), new Duration(fast, "seconds")),
      metric,
    );
  };

  // Warm-up, cool-down and recovery jogs all keep the easy range, so the watch
  // tells you to slow down if you start too fast. Zones 1 and 2 share one range.
  const EASY_ZONE = 1;

  // The format has one warm-up step and one cool-down step, so several
  // consecutive ones are merged into a single step of their total duration.
  const totalGoal = (list: TimelineSegment[]) =>
    new TimeGoal(
      new Duration(
        Math.max(1, Math.round(list.reduce((sum, s) => sum + s.durationMin, 0) * 60)),
        "seconds",
      ),
    );

  // The Watch ignores a pace alert on the dedicated warm-up and cool-down
  // slots: Apple's custom workout screen only offers a heart rate alert there,
  // and a real run confirmed it stayed silent. Pace alerts do fire on regular
  // block steps. So when pace alerts are written, warm-up and cool-down become
  // ordinary "recovery" steps at the start and end of the block. The cost is
  // that the Watch no longer labels them as warm-up and cool-down. Without a
  // VMA there is no alert to lose, so the dedicated slots are kept.
  const alertsOnWarmupSlots = paces !== null;

  if (!alertsOnWarmupSlots) {
    if (warmups.length > 0) custom.warmup = new Step(totalGoal(warmups));
    if (cooldowns.length > 0) custom.cooldown = new Step(totalGoal(cooldowns));
  }

  const blockWarmups = alertsOnWarmupSlots ? warmups : [];
  const blockCooldowns = alertsOnWarmupSlots ? cooldowns : [];

  if (main.length > 0 || blockWarmups.length > 0 || blockCooldowns.length > 0) {
    const block = custom.addBlock(1);
    if (blockWarmups.length > 0) {
      block.addStep("recovery", totalGoal(blockWarmups), "Warm-up", alertFor(EASY_ZONE));
    }
    for (const seg of main) {
      const purpose = seg.isRecovery ? "recovery" : "work";
      const zone = seg.isRecovery ? EASY_ZONE : seg.zoneNumber;
      const alert = zone ? alertFor(zone) : undefined;
      block.addStep(purpose, goalFor(seg), seg.description.substring(0, 32) || undefined, alert);
    }
    if (blockCooldowns.length > 0) {
      block.addStep("recovery", totalGoal(blockCooldowns), "Cool-down", alertFor(EASY_ZONE));
    }
  }

  return plan;
}
