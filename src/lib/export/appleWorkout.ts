/**
 * Apple Watch export, a `.workout` file for the Workout app.
 *
 * Builds the same binary format the Workout app produces when you tap Share
 * Workout, with @bibixx/workoutkit. No Apple developer account and no native
 * app are needed. The file is opened on the iPhone (Files, AirDrop, Mail) and
 * the Workout app offers to add it to the Watch. Requires iOS 17 and
 * watchOS 10 or later.
 *
 * Hard steps carry a pace-range alert taken from the runner's VMA, so the
 * Watch buzzes when the pace drifts out of range. Warm-up, cool-down and
 * recoveries carry no alert.
 *
 * The format is reverse engineered by the library, not specified by Apple, so
 * a future watchOS could stop accepting it.
 */

import type { WorkoutTemplate } from "@/types";
import { transformSessionBlocks } from "@/components/visualization/transforms";
import { triggerDownload } from "./download";
import { segmentsToAppleWorkout, type AppleWorkoutOptions } from "./appleWorkoutBuilder";

export type { AppleWorkoutOptions } from "./appleWorkoutBuilder";

/** Build and download a `.workout` file for a workout template. */
export async function exportToAppleWorkout(
  workout: WorkoutTemplate,
  options: AppleWorkoutOptions = {},
): Promise<void> {
  const [kit, { toBlob }] = await Promise.all([
    import("@bibixx/workoutkit"),
    import("@bibixx/workoutkit/encode"),
  ]);
  const { segments } = transformSessionBlocks(workout);
  const plan = segmentsToAppleWorkout(kit, segments, workout.nameEn || workout.name, options);
  triggerDownload(toBlob(plan), `${workout.id}.workout`);
}
