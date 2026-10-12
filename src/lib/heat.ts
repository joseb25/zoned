/**
 * Heat adjustment, slow the pace targets when the air is humid.
 *
 * Pure functions, no network. The caller supplies temperature and relative
 * humidity (or the dew point directly), read off a weather app.
 *
 * Model: a dew-point table commonly used by running coaches (Runners Connect
 * publishes one). Dew point is used rather than air temperature because it
 * tracks how well sweat can evaporate. The percentages assume a fully
 * heat-acclimated runner, so an unacclimated runner should expect to be
 * slower still, and the real cost also depends on sun, wind and shade.
 *
 *   dew point (F)   pace slower by
 *   below 55        0 %
 *   55-60           1 %
 *   60-65           2-3 %
 *   65-70           3-5 %
 *   70-75           5-8 %
 *   75-80           12-15 %
 *   above 80        run by effort, not by pace
 *
 * This is a heuristic, not a measurement of heat strain.
 */

export type HeatAdvice = "normal" | "slower" | "easy_only" | "by_effort";

export interface HeatAdjustment {
  /** Dew point used for the lookup, in Fahrenheit. */
  dewPointF: number;
  /** How much slower to run, in percent. 0 below a 55F dew point. */
  slowerPercent: number;
  /** Multiplier to apply to a pace in min/km (1.05 = 5 % slower). */
  paceFactor: number;
  advice: HeatAdvice;
}

/** Knots of the dew-point table, as [dew point F, percent slower]. */
const KNOTS: ReadonlyArray<readonly [number, number]> = [
  [55, 0],
  [57.5, 1],
  [62.5, 2.5],
  [67.5, 4],
  [72.5, 6.5],
  [77.5, 13.5],
  [80, 15],
];

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

/**
 * Dew point from air temperature and relative humidity, Magnus formula.
 * Valid for roughly -45C to 60C and humidity above 1 %.
 */
export function dewPointC(tempC: number, relativeHumidityPct: number): number {
  const rh = Math.min(100, Math.max(1, relativeHumidityPct));
  const a = 17.62;
  const b = 243.12;
  const gamma = Math.log(rh / 100) + (a * tempC) / (b + tempC);
  return (b * gamma) / (a - gamma);
}

function percentSlowerForDewPointF(dewF: number): number {
  const first = KNOTS[0];
  const last = KNOTS[KNOTS.length - 1];
  if (dewF <= first[0]) return 0;
  if (dewF >= last[0]) return last[1];
  for (let i = 1; i < KNOTS.length; i++) {
    const [x1, y1] = KNOTS[i];
    if (dewF <= x1) {
      const [x0, y0] = KNOTS[i - 1];
      return y0 + ((dewF - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return last[1];
}

/** Adjustment for a dew point given in Celsius. */
export function heatAdjustmentFromDewPoint(dewPointCelsius: number): HeatAdjustment {
  const dewPointF = celsiusToFahrenheit(dewPointCelsius);
  const slowerPercent = Math.round(percentSlowerForDewPointF(dewPointF) * 10) / 10;

  let advice: HeatAdvice = "normal";
  if (dewPointF > 80) advice = "by_effort";
  else if (dewPointF >= 75) advice = "easy_only";
  else if (slowerPercent >= 1) advice = "slower";

  return {
    dewPointF: Math.round(dewPointF * 10) / 10,
    slowerPercent,
    paceFactor: 1 + slowerPercent / 100,
    advice,
  };
}

/** Adjustment from air temperature (C) and relative humidity (%). */
export function heatAdjustment(tempC: number, relativeHumidityPct: number): HeatAdjustment {
  return heatAdjustmentFromDewPoint(dewPointC(tempC, relativeHumidityPct));
}

/** Apply an adjustment to a pace in min/km. Slower means a larger number. */
export function adjustPaceForHeat(paceMinPerKm: number, adjustment: HeatAdjustment): number {
  return Math.round(paceMinPerKm * adjustment.paceFactor * 100) / 100;
}
