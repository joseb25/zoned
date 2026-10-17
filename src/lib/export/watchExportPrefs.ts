/**
 * Remembered choice for the Apple Watch export: which pace the alerts follow.
 *
 * Heat is not remembered, it changes every run. The alert style is a taste, so
 * it is kept in this browser like the rest of the app's state.
 */

import { DEFAULT_ALERT_METRIC, type AlertMetric } from "./appleWorkoutBuilder";

const STORAGE_KEY = "zoned-watch-alert-metric";

export function loadAlertMetric(): AlertMetric {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "current" || stored === "average" ? stored : DEFAULT_ALERT_METRIC;
  } catch {
    // Storage refused (private mode): the default is a fine answer
    return DEFAULT_ALERT_METRIC;
  }
}

export function saveAlertMetric(metric: AlertMetric): void {
  try {
    localStorage.setItem(STORAGE_KEY, metric);
  } catch {
    // Not saved: the choice still applies to this export, it is only forgotten
  }
}
