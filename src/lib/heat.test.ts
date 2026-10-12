import { describe, expect, test } from "bun:test";
import {
  adjustPaceForHeat,
  celsiusToFahrenheit,
  dewPointC,
  heatAdjustment,
  heatAdjustmentFromDewPoint,
} from "./heat";

describe("dewPointC", () => {
  test("equals air temperature at 100 % humidity", () => {
    expect(dewPointC(20, 100)).toBeCloseTo(20, 1);
  });

  test("matches a known reference value", () => {
    // 25C at 60 % relative humidity is about 16.7C dew point
    expect(dewPointC(25, 60)).toBeCloseTo(16.7, 0);
  });
});

describe("heatAdjustmentFromDewPoint", () => {
  test("no adjustment below a 55F dew point", () => {
    const adj = heatAdjustmentFromDewPoint(10); // 50F
    expect(adj.slowerPercent).toBe(0);
    expect(adj.paceFactor).toBe(1);
    expect(adj.advice).toBe("normal");
  });

  test("grows monotonically with dew point", () => {
    let previous = -1;
    for (let c = 5; c <= 30; c += 1) {
      const pct = heatAdjustmentFromDewPoint(c).slowerPercent;
      expect(pct).toBeGreaterThanOrEqual(previous);
      previous = pct;
    }
  });

  test("lands inside the published band at 70F dew point", () => {
    const c = ((70 - 32) * 5) / 9;
    const pct = heatAdjustmentFromDewPoint(c).slowerPercent;
    expect(pct).toBeGreaterThanOrEqual(3);
    expect(pct).toBeLessThanOrEqual(8);
  });

  test("flags easy-only from a 75F dew point", () => {
    const c = ((76 - 32) * 5) / 9;
    expect(heatAdjustmentFromDewPoint(c).advice).toBe("easy_only");
  });

  test("switches to effort-based above 80F and caps the percentage", () => {
    const c = ((85 - 32) * 5) / 9;
    const adj = heatAdjustmentFromDewPoint(c);
    expect(adj.advice).toBe("by_effort");
    expect(adj.slowerPercent).toBe(15);
  });
});

describe("heatAdjustment and adjustPaceForHeat", () => {
  test("a mild dry day leaves the pace alone", () => {
    const adj = heatAdjustment(18, 50);
    expect(adjustPaceForHeat(5, adj)).toBe(5);
  });

  test("a hot humid day slows the pace", () => {
    const adj = heatAdjustment(30, 70);
    expect(celsiusToFahrenheit(30)).toBe(86);
    expect(adj.slowerPercent).toBeGreaterThan(5);
    expect(adjustPaceForHeat(5, adj)).toBeGreaterThan(5.25);
  });
});
