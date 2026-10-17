/**
 * AppleWatchExportDialog - Options asked before the Apple Watch export.
 *
 * Two choices shape the file: how hot and humid the run will be (the pace
 * ranges are slowed by `heatAdjustment`), and which pace the Watch compares
 * with the range (current or average). Leaving the weather empty exports the
 * ranges unchanged.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Watch } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { heatAdjustment, type HeatAdjustment } from "@/lib/heat";
import type { AlertMetric } from "@/lib/export";

export interface AppleWatchExportChoice {
  /** Multiplier for every pace range, 1 when no weather was entered. */
  paceFactor: number;
  alertMetric: AlertMetric;
}

interface AppleWatchExportDialogProps {
  /** Without a saved VMA the file carries no pace alerts, the dialog says so. */
  hasVma: boolean;
  initialMetric: AlertMetric;
  onConfirm: (choice: AppleWatchExportChoice) => void;
  onCancel: () => void;
}

const MIN_TEMP_C = -30;
const MAX_TEMP_C = 50;

function parseNumber(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(value) ? value : null;
}

function dewPointCelsius(adjustment: HeatAdjustment): number {
  return Math.round((((adjustment.dewPointF - 32) * 5) / 9) * 10) / 10;
}

export function AppleWatchExportDialog({
  hasVma,
  initialMetric,
  onConfirm,
  onCancel,
}: AppleWatchExportDialogProps) {
  const { t } = useTranslation("common");
  const [temperature, setTemperature] = useState("");
  const [humidity, setHumidity] = useState("");
  const [alertMetric, setAlertMetric] = useState<AlertMetric>(initialMetric);

  const temp = parseNumber(temperature);
  const rh = parseNumber(humidity);
  const nothingEntered = temperature.trim() === "" && humidity.trim() === "";
  const inRange =
    temp !== null && rh !== null && temp >= MIN_TEMP_C && temp <= MAX_TEMP_C && rh >= 1 && rh <= 100;
  const adjustment = inRange ? heatAdjustment(temp, rh) : null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onConfirm({ paceFactor: adjustment?.paceFactor ?? 1, alertMetric });
  };

  const gap = (value: string) => ({ "--gap": value }) as React.CSSProperties;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="zn-row" style={gap("var(--sp-5)")}>
            <Watch size={20} />
            {t("export.appleOptions.title")}
          </DialogTitle>
          <DialogDescription>{t("export.appleOptions.intro")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="zn-stack" style={gap("var(--sp-8)")}>
          {!hasVma && (
            <p className="zn-body zn-body--sm" role="status">
              {t("export.appleOptions.noVma")}
            </p>
          )}

          <div className="zn-stack" style={gap("var(--sp-4)")}>
            <span className="zn-label">{t("export.appleOptions.heatTitle")}</span>
            <div className="zn-row" style={gap("var(--sp-5)")}>
              <div className="zn-stack zn-fill" style={gap("var(--sp-3)")}>
                <label htmlFor="watch-temp" className="zn-caption">
                  {t("export.appleOptions.temperature")}
                </label>
                <input
                  id="watch-temp"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={MIN_TEMP_C}
                  max={MAX_TEMP_C}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="zn-native-field"
                />
              </div>
              <div className="zn-stack zn-fill" style={gap("var(--sp-3)")}>
                <label htmlFor="watch-humidity" className="zn-caption">
                  {t("export.appleOptions.humidity")}
                </label>
                <input
                  id="watch-humidity"
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min={1}
                  max={100}
                  value={humidity}
                  onChange={(e) => setHumidity(e.target.value)}
                  className="zn-native-field"
                />
              </div>
            </div>

            <p className="zn-caption zn-muted" role="status">
              {nothingEntered && t("export.appleOptions.heatOptional")}
              {!nothingEntered && !adjustment && t("export.appleOptions.heatInvalid")}
              {adjustment &&
                adjustment.slowerPercent === 0 &&
                t("export.appleOptions.heatNone", { dew: dewPointCelsius(adjustment) })}
              {adjustment &&
                adjustment.slowerPercent > 0 &&
                t("export.appleOptions.heatSlower", {
                  dew: dewPointCelsius(adjustment),
                  percent: adjustment.slowerPercent,
                })}
              {adjustment?.advice === "easy_only" && ` ${t("export.appleOptions.adviceEasyOnly")}`}
              {adjustment?.advice === "by_effort" && ` ${t("export.appleOptions.adviceByEffort")}`}
            </p>
          </div>

          <div className="zn-stack" style={gap("var(--sp-4)")}>
            <span className="zn-label">{t("export.appleOptions.alertTitle")}</span>
            <Segmented<AlertMetric>
              value={alertMetric}
              onChange={setAlertMetric}
              label={t("export.appleOptions.alertTitle")}
              options={[
                { value: "current", label: t("export.appleOptions.alertCurrent") },
                { value: "average", label: t("export.appleOptions.alertAverage") },
              ]}
            />
            <p className="zn-caption zn-muted">
              {alertMetric === "current"
                ? t("export.appleOptions.alertCurrentHint")
                : t("export.appleOptions.alertAverageHint")}
            </p>
          </div>

          <div className="zn-row" style={gap("var(--sp-5)")}>
            <Button type="button" variant="outline" onClick={onCancel} className="zn-fill">
              {t("actions.cancel")}
            </Button>
            <Button type="submit" className="zn-fill">
              {t("export.download")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
