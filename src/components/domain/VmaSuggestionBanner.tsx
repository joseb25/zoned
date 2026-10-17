/**
 * VmaSuggestionBanner - Says when the hard sessions keep landing off target.
 *
 * `suggestVmaAdjustment` only suggests, so this banner shows the evidence in
 * plain words and lets the runner apply it or leave it. It renders nothing
 * unless the suggestion is a raise or a cut.
 */

import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { VmaAdjustment } from "@/lib/planGenerator/paceAdapt";

interface VmaSuggestionBannerProps {
  adjustment: VmaAdjustment;
  onApply: (suggestedVma: number) => void;
  onDismiss: () => void;
}

export function VmaSuggestionBanner({ adjustment, onApply, onDismiss }: VmaSuggestionBannerProps) {
  const { t } = useTranslation("plan");

  const faster = adjustment.reason === "faster_than_target";
  const slower = adjustment.reason === "slower_than_target";
  if (!faster && !slower) return null;

  const change = adjustment.changePercent;
  const values = {
    count: adjustment.sampleSize,
    deviation: Math.abs(adjustment.medianDeviationPercent ?? 0),
    suggested: adjustment.suggestedVma,
    current: adjustment.currentVma,
    change: `${change > 0 ? "+" : ""}${change}`,
  };

  return (
    <Alert
      kind="info"
      title={t(faster ? "vmaSuggestion.fasterTitle" : "vmaSuggestion.slowerTitle")}
      action={
        <>
          <Button type="button" size="sm" onClick={() => onApply(adjustment.suggestedVma)}>
            {t("vmaSuggestion.apply", { vma: adjustment.suggestedVma })}
          </Button>{" "}
          <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
            {t("vmaSuggestion.dismiss")}
          </Button>
        </>
      }
    >
      {t(faster ? "vmaSuggestion.fasterText" : "vmaSuggestion.slowerText", values)}{" "}
      {t("vmaSuggestion.impact")}
    </Alert>
  );
}
