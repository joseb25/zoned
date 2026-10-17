import { describe, expect, test } from "bun:test";
import type { PlanSession, PlanWeek, TrainingPlan } from "@/types/plan";
import { calculateTrainingPaces } from "./paceEngine";
import { applyVmaAdjustment, isQualitySessionType, suggestVmaAdjustment } from "./paceAdapt";

const VMA = 15;
const thresholdTarget = (() => {
  const t = calculateTrainingPaces(VMA, "intermediate").T;
  return (t.min + t.max) / 2;
})();

function session(over: Partial<PlanSession> = {}): PlanSession {
  return {
    dayOfWeek: 1,
    workoutId: "T-001",
    sessionType: "threshold",
    isKeySession: true,
    estimatedDurationMin: 50,
    status: "completed",
    rpe: 6,
    ...over,
  };
}

function plan(weeks: PlanWeek[]): TrainingPlan {
  return {
    id: "p",
    name: "p",
    nameEn: "p",
    totalWeeks: 12,
    phases: [],
    weeks,
    config: {
      id: "c",
      daysPerWeek: 4,
      createdAt: "2026-01-01",
      vma: VMA,
      runnerLevel: "intermediate",
      raceDistance: "10K",
    },
  } as unknown as TrainingPlan;
}

function week(weekNumber: number, sessions: PlanSession[]): PlanWeek {
  return { weekNumber, phase: "build", isRecoveryWeek: false, volumePercent: 100, sessions } as PlanWeek;
}

function threeFast(rpe = 6): TrainingPlan {
  const fast = thresholdTarget * 0.95;
  return plan([
    week(1, [session({ actualWorkPaceMinKm: fast, rpe })]),
    week(2, [session({ actualWorkPaceMinKm: fast, rpe })]),
    week(3, [session({ actualWorkPaceMinKm: fast, rpe })]),
  ]);
}

describe("suggestVmaAdjustment", () => {
  test("says nothing with fewer than three quality sessions", () => {
    const p = plan([week(1, [session({ actualWorkPaceMinKm: thresholdTarget * 0.9 })])]);
    const r = suggestVmaAdjustment(p, 1);
    expect(r.reason).toBe("not_enough_data");
    expect(r.suggestedVma).toBe(VMA);
  });

  test("raises the VMA when the work is repeatedly faster than target", () => {
    const r = suggestVmaAdjustment(threeFast(), 3);
    expect(r.reason).toBe("faster_than_target");
    expect(r.suggestedVma).toBeGreaterThan(VMA);
    expect(r.medianDeviationPercent).toBeLessThan(0);
  });

  test("caps a single raise at 2 percent", () => {
    const fast = thresholdTarget * 0.8;
    const p = plan([
      week(1, [session({ actualWorkPaceMinKm: fast })]),
      week(2, [session({ actualWorkPaceMinKm: fast })]),
      week(3, [session({ actualWorkPaceMinKm: fast })]),
    ]);
    const r = suggestVmaAdjustment(p, 3);
    expect(r.changePercent).toBeLessThanOrEqual(2);
  });

  test("does not raise targets when the sessions felt very hard", () => {
    const r = suggestVmaAdjustment(threeFast(9), 3);
    expect(r.reason).toBe("fatigue_guard");
    expect(r.suggestedVma).toBe(VMA);
  });

  test("lowers the VMA when the work is repeatedly slower than target", () => {
    const slow = thresholdTarget * 1.08;
    const p = plan([
      week(1, [session({ actualWorkPaceMinKm: slow })]),
      week(2, [session({ actualWorkPaceMinKm: slow })]),
      week(3, [session({ actualWorkPaceMinKm: slow })]),
    ]);
    const r = suggestVmaAdjustment(p, 3);
    expect(r.reason).toBe("slower_than_target");
    expect(r.suggestedVma).toBeLessThan(VMA);
    expect(r.changePercent).toBeGreaterThanOrEqual(-4);
  });

  test("leaves on-target running alone", () => {
    const p = plan([
      week(1, [session({ actualWorkPaceMinKm: thresholdTarget })]),
      week(2, [session({ actualWorkPaceMinKm: thresholdTarget * 1.01 })]),
      week(3, [session({ actualWorkPaceMinKm: thresholdTarget * 0.99 })]),
    ]);
    expect(suggestVmaAdjustment(p, 3).reason).toBe("on_target");
  });

  test("ignores easy runs and sessions without a recorded pace", () => {
    const p = plan([
      week(1, [
        session({ sessionType: "endurance", actualWorkPaceMinKm: 4 }),
        session({ actualWorkPaceMinKm: undefined }),
      ]),
    ]);
    expect(suggestVmaAdjustment(p, 1).sampleSize).toBe(0);
  });
});

describe("applyVmaAdjustment", () => {
  test("updates the VMA and the paces of future planned sessions only", () => {
    const old = calculateTrainingPaces(VMA, "intermediate").T;
    const note = () => ({ zone: "T", paceMinKm: old.min, paceMaxKm: old.max, description: "", descriptionEn: "" });
    const p = plan([
      week(1, [session({ paceNotes: [note()] })]),
      week(2, [session({ status: "planned", paceNotes: [note()] })]),
    ]);

    const next = applyVmaAdjustment(p, 16, 1);
    const fresh = calculateTrainingPaces(16, "intermediate").T;

    expect(next.config.vma).toBe(16);
    expect(next.weeks[0].sessions[0].paceNotes?.[0].paceMinKm).toBe(old.min);
    expect(next.weeks[1].sessions[0].paceNotes?.[0].paceMinKm).toBe(fresh.min);
    expect(p.config.vma).toBe(VMA);
  });

  test("stamps the adjustment time on the plan", () => {
    const at = new Date("2026-03-01T10:00:00.000Z");
    const next = applyVmaAdjustment(plan([week(1, [session()])]), 16, 1, at);
    expect(next.config.vmaAdjustedAt).toBe("2026-03-01T10:00:00.000Z");
  });
});

describe("after an applied adjustment", () => {
  const fast = thresholdTarget * 0.95;
  const done = (completedAt: string) => session({ actualWorkPaceMinKm: fast, completedAt });

  test("sessions done before it no longer count", () => {
    const p = plan([
      week(1, [done("2026-02-01T08:00:00.000Z")]),
      week(2, [done("2026-02-08T08:00:00.000Z")]),
      week(3, [done("2026-02-15T08:00:00.000Z")]),
    ]);
    expect(suggestVmaAdjustment(p, 3).reason).toBe("faster_than_target");

    p.config.vmaAdjustedAt = "2026-02-20T00:00:00.000Z";
    const after = suggestVmaAdjustment(p, 3);
    expect(after.reason).toBe("not_enough_data");
    expect(after.sampleSize).toBe(0);
  });

  test("sessions done after it count again", () => {
    const p = plan([
      week(1, [done("2026-02-25T08:00:00.000Z")]),
      week(2, [done("2026-03-02T08:00:00.000Z")]),
      week(3, [done("2026-03-09T08:00:00.000Z")]),
    ]);
    p.config.vmaAdjustedAt = "2026-02-20T00:00:00.000Z";
    expect(suggestVmaAdjustment(p, 3).sampleSize).toBe(3);
  });

  test("a session without a completion time does not count", () => {
    const p = plan([
      week(1, [session({ actualWorkPaceMinKm: fast })]),
      week(2, [session({ actualWorkPaceMinKm: fast })]),
      week(3, [session({ actualWorkPaceMinKm: fast })]),
    ]);
    p.config.vmaAdjustedAt = "2026-02-20T00:00:00.000Z";
    expect(suggestVmaAdjustment(p, 3).sampleSize).toBe(0);
  });
});

describe("isQualitySessionType", () => {
  test("knows which sessions have a comparable target pace", () => {
    expect(isQualitySessionType("threshold")).toBe(true);
    expect(isQualitySessionType("intervals")).toBe(true);
    expect(isQualitySessionType("long_run")).toBe(false);
    expect(isQualitySessionType("fartlek")).toBe(false);
  });
});
