import { describe, expect, test } from "bun:test";
import * as kit from "@bibixx/workoutkit";
import { decode } from "@bibixx/workoutkit/decode";
import { encode } from "@bibixx/workoutkit/encode";
import type { TimelineSegment } from "@/components/visualization/types";
import { segmentsToAppleWorkout } from "./appleWorkoutBuilder";

function seg(over: Partial<TimelineSegment>): TimelineSegment {
  return {
    id: "s",
    type: "main",
    description: "work",
    durationMin: 5,
    zoneNumber: 4,
    widthPercent: 0,
    isRecovery: false,
    ...over,
  };
}

const SEGMENTS: TimelineSegment[] = [
  seg({ type: "warmup", description: "Warm-up", durationMin: 10, zoneNumber: 1 }),
  seg({ description: "Threshold", durationMin: 8, zoneNumber: 4 }),
  seg({ description: "Jog", durationMin: 2, zoneNumber: 1, isRecovery: true }),
  seg({ description: "Threshold", durationMin: 8, zoneNumber: 4 }),
  seg({ type: "cooldown", description: "Cool-down", durationMin: 5, zoneNumber: 1 }),
];

describe("segmentsToAppleWorkout", () => {
  test("encodes to bytes that decode back to the same workout", () => {
    const plan = segmentsToAppleWorkout(kit, SEGMENTS, "Threshold 2x8", { vma: 15 });
    const bytes = encode(plan);
    expect(bytes.length).toBeGreaterThan(20);

    const back = decode(bytes);
    expect(back.custom?.displayName).toBe("Threshold 2x8");
    expect(back.custom?.blocks.length).toBe(1);
    // Warm-up, two threshold reps, one jog, cool-down: five regular steps.
    expect(back.custom?.blocks[0].steps.length).toBe(5);
  });

  test("with a VMA, warm-up and cool-down are block steps, not the dedicated slots", () => {
    // The Watch ignores a pace alert on the dedicated warm-up and cool-down
    // slots, so they must not be used when alerts are written.
    const back = decode(encode(segmentsToAppleWorkout(kit, SEGMENTS, "x", { vma: 15 })));
    expect(back.custom?.warmup).toBeUndefined();
    expect(back.custom?.cooldown).toBeUndefined();
    const steps = back.custom!.blocks[0].steps;
    expect(steps[0].step.displayName).toBe("Warm-up");
    expect(steps[steps.length - 1].step.displayName).toBe("Cool-down");
  });

  test("without a VMA, warm-up and cool-down keep the dedicated slots and no alerts", () => {
    const back = decode(encode(segmentsToAppleWorkout(kit, SEGMENTS, "x")));
    expect(back.custom?.warmup).toBeDefined();
    expect(back.custom?.cooldown).toBeDefined();
    expect(back.custom?.warmup?.alert).toBeUndefined();
    expect(back.custom?.cooldown?.alert).toBeUndefined();
    const steps = back.custom!.blocks[0].steps;
    expect(steps.length).toBe(3);
    expect(steps.every((s) => s.step.alert === undefined)).toBe(true);
  });

  test("writes a pace alert on every step when a VMA is set", () => {
    const back = decode(encode(segmentsToAppleWorkout(kit, SEGMENTS, "x", { vma: 15 })));
    const steps = back.custom!.blocks[0].steps;
    expect(steps.length).toBe(5);
    expect(steps.every((s) => s.step.alert !== undefined)).toBe(true);
  });

  test("warm-up, recovery and cool-down use the easy range, slower than the work range", () => {
    const back = decode(encode(segmentsToAppleWorkout(kit, SEGMENTS, "x", { vma: 15 })));
    const steps = back.custom!.blocks[0].steps;
    const warmup = JSON.stringify(steps[0].step.alert);
    const work = JSON.stringify(steps[1].step.alert);
    const recovery = JSON.stringify(steps[2].step.alert);
    const cooldown = JSON.stringify(steps[4].step.alert);
    expect(recovery).not.toBe(work);
    expect(warmup).toBe(recovery);
    expect(cooldown).toBe(recovery);
  });

  test("a heat factor slows the pace range", () => {
    const cool = decode(encode(segmentsToAppleWorkout(kit, SEGMENTS, "x", { vma: 15 })));
    const hot = decode(encode(segmentsToAppleWorkout(kit, SEGMENTS, "x", { vma: 15, paceFactor: 1.1 })));
    const a = JSON.stringify(cool.custom!.blocks[0].steps[1].step.alert);
    const b = JSON.stringify(hot.custom!.blocks[0].steps[1].step.alert);
    expect(a).not.toBe(b);
  });

  test("treadmill runs are marked indoor", () => {
    const plan = segmentsToAppleWorkout(kit, SEGMENTS, "x", { treadmill: true });
    expect(decode(encode(plan)).custom?.location).toBe("indoor");
  });
});
