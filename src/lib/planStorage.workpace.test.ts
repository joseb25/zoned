import { beforeEach, describe, expect, test } from "bun:test";

import type { PlanSession, TrainingPlan } from "@/types/plan";
import { getPlan, savePlan, updateSessionCompletion } from "./planStorage";

class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

function seed(): void {
  const session: PlanSession = {
    dayOfWeek: 1,
    workoutId: "T-001",
    sessionType: "threshold",
    isKeySession: true,
    estimatedDurationMin: 50,
  };
  const plan: TrainingPlan = {
    id: "p",
    config: { id: "p", daysPerWeek: 4, createdAt: "2026-09-01T10:00:00.000Z", startDate: "2026-08-31", isSingleWeek: true },
    weeks: [{ weekNumber: 1, phase: "base", isRecoveryWeek: false, volumePercent: 100, sessions: [session] }],
    totalWeeks: 1,
    phases: [{ phase: "base", startWeek: 1, endWeek: 1 }],
    name: "p",
    nameEn: "p",
    version: 2,
  } as unknown as TrainingPlan;
  expect(savePlan(plan).ok).toBe(true);
}

const stored = () => getPlan("p")!.weeks[0].sessions[0];

describe("updateSessionCompletion, real pace of the hard part", () => {
  beforeEach(() => {
    (globalThis as { localStorage: unknown }).localStorage = new MemoryStorage();
    seed();
  });

  test("keeps the pace through a save and a reload", () => {
    updateSessionCompletion("p", 1, 0, {
      status: "completed",
      completedAt: "2026-09-02T08:00:00.000Z",
      actualWorkPaceMinKm: 5.5,
      rpe: 7,
    });
    expect(stored().actualWorkPaceMinKm).toBe(5.5);
  });

  test("a save that omits the key leaves the pace alone", () => {
    updateSessionCompletion("p", 1, 0, { status: "completed", actualWorkPaceMinKm: 5.5 });
    updateSessionCompletion("p", 1, 0, { status: "completed" });
    expect(stored().actualWorkPaceMinKm).toBe(5.5);
  });

  test("a save that passes the key as undefined clears the pace", () => {
    updateSessionCompletion("p", 1, 0, { status: "completed", actualWorkPaceMinKm: 5.5 });
    updateSessionCompletion("p", 1, 0, { status: "skipped", actualWorkPaceMinKm: undefined });
    expect(stored().actualWorkPaceMinKm).toBeUndefined();
  });
});
