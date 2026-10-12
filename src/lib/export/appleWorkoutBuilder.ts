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
}

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

  // The format has one warm-up step and one cool-down step, so several
  // consecutive ones are merged into a single step of their total duration.
  const merged = (list: TimelineSegment[]) =>
    new Step(
      new TimeGoal(
        new Duration(
          Math.max(1, Math.round(list.reduce((sum, s) => sum + s.durationMin, 0) * 60)),
          "seconds",
        ),
      ),
    );

  if (warmups.length > 0) custom.warmup = merged(warmups);
  if (cooldowns.length > 0) custom.cooldown = merged(cooldowns);

  if (main.length > 0) {
    const block = custom.addBlock(1);
    for (const seg of main) {
      const purpose = seg.isRecovery ? "recovery" : "work";
      let alert;
      if (!seg.isRecovery && paces && seg.zoneNumber) {
        const { slow, fast } = paceRangeSeconds(seg.zoneNumber, paces, factor);
        // A slower pace is a lower speed, so the slow end is the minimum.
        alert = new SpeedRangeAlert(
          new Speed(new Distance(1, "kilometers"), new Duration(slow, "seconds")),
          new Speed(new Distance(1, "kilometers"), new Duration(fast, "seconds")),
          "average",
        );
      }
      block.addStep(purpose, goalFor(seg), seg.description.substring(0, 32) || undefined, alert);
    }
  }

  return plan;
}
