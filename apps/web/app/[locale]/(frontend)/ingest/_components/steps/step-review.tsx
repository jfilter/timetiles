/**
 * Review step for the import wizard.
 *
 * Shows a summary of all configuration before starting the import.
 * Organized into clear sections: data flow, field mappings, record handling.
 * Shows schedule configuration when importing from a URL.
 *
 * @module
 * @category Components
 */

"use client";

import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowLeft, CalendarIcon, Loader2, Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { useIngestConfigureMutation } from "@/lib/hooks/use-ingest-wizard-mutations";

import { useUpdateSchedule } from "../use-update-schedule";
import { useWizardReviewStepState } from "../wizard-store";
import { ReviewDataFlowCard, ReviewMappingsCard, ReviewScheduleCard, ReviewTransformsCard } from "./review-sections";

export interface StepReviewProps {
  className?: string;
}

export const StepReview = ({ className }: Readonly<StepReviewProps>) => {
  const t = useTranslations("Ingest");
  const {
    file,
    sheets,
    selectedCatalogId,
    newCatalogName,
    sheetMappings,
    fieldMappings,
    deduplicationStrategy,
    geocodingEnabled,
    sourceUrl,
    authConfig,
    scheduleConfig,
    jsonApiConfig,
    previewId: wizardPreviewId,
    transforms: wizardTransforms,
    error: wizardError,
    editMode,
    editScheduleId,
    prevStep,
    startProcessing,
    nextStep,
    setError,
  } = useWizardReviewStepState();

  const { updateSchedule, isUpdating } = useUpdateSchedule();

  const configureMutation = useIngestConfigureMutation();

  const handleStartImport = useCallback(async () => {
    setError(null);
    try {
      const createSchedule =
        sourceUrl && scheduleConfig?.enabled
          ? {
              enabled: true as const,
              sourceUrl,
              name: scheduleConfig.name,
              scheduleType: scheduleConfig.scheduleType,
              frequency: scheduleConfig.scheduleType === "frequency" ? scheduleConfig.frequency : undefined,
              cronExpression: scheduleConfig.scheduleType === "cron" ? scheduleConfig.cronExpression : undefined,
              schemaMode: scheduleConfig.schemaMode,
              authConfig: authConfig ?? undefined,
              jsonApiConfig: jsonApiConfig ?? undefined,
            }
          : undefined;
      const transformsPayload = Object.entries(wizardTransforms)
        .filter(([, t]) => t.length > 0)
        .map(([idx, transforms]) => ({ sheetIndex: Number(idx), transforms }));
      if (selectedCatalogId == null) {
        setError(t("pleaseSelectCatalog"));
        return;
      }
      const data = await configureMutation.mutateAsync({
        previewId: wizardPreviewId ?? "",
        catalogId: selectedCatalogId,
        newCatalogName: selectedCatalogId === "new" ? newCatalogName : undefined,
        sheetMappings,
        fieldMappings,
        deduplicationStrategy,
        geocodingEnabled,
        transforms: transformsPayload.length > 0 ? transformsPayload : undefined,
        createSchedule,
      });
      startProcessing({ ingestFileId: data.ingestFileId, scheduledIngestId: data.scheduledIngestId });
      nextStep();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToStartImport"));
    }
  }, [
    sourceUrl,
    scheduleConfig,
    jsonApiConfig,
    authConfig,
    wizardTransforms,
    wizardPreviewId,
    configureMutation,
    selectedCatalogId,
    newCatalogName,
    sheetMappings,
    fieldMappings,
    deduplicationStrategy,
    geocodingEnabled,
    startProcessing,
    nextStep,
    setError,
    t,
  ]);

  const handleUpdateSchedule = useCallback(
    (triggerRun = false) => {
      if (!editScheduleId || !scheduleConfig) return;
      updateSchedule(
        {
          editScheduleId,
          previewId: wizardPreviewId ?? "",
          catalogId: selectedCatalogId,
          newCatalogName,
          sheetMappings,
          fieldMappings,
          deduplicationStrategy,
          geocodingEnabled,
          transforms: wizardTransforms,
          scheduleConfig,
          authConfig,
          jsonApiConfig,
        },
        triggerRun
      );
    },
    [
      editScheduleId,
      scheduleConfig,
      updateSchedule,
      wizardPreviewId,
      selectedCatalogId,
      newCatalogName,
      sheetMappings,
      fieldMappings,
      deduplicationStrategy,
      geocodingEnabled,
      wizardTransforms,
      authConfig,
      jsonApiConfig,
    ]
  );

  const catalogName = selectedCatalogId === "new" ? newCatalogName : t("catalogNumber", { id: selectedCatalogId ?? 0 });
  const datasetNames = sheetMappings.map((m) =>
    m.datasetId === "new" ? m.newDatasetName : t("datasetNumber", { id: m.datasetId })
  );
  const mappingsWithDataset = fieldMappings.map((mapping) => {
    const sm = sheetMappings.find((s) => s.sheetIndex === mapping.sheetIndex);
    const sheet = sheets.find((s) => s.index === mapping.sheetIndex);
    const name = sm?.datasetId === "new" ? sm.newDatasetName : t("datasetNumber", { id: sm?.datasetId ?? 0 });
    return { mapping, datasetName: name ?? sheet?.name ?? t("sheetNumber", { number: mapping.sheetIndex + 1 }) };
  });
  const totalRows = sheets.reduce((sum, s) => sum + s.rowCount, 0);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-center">
        <h2 className="text-foreground font-serif text-3xl font-bold">{t("reviewTitle")}</h2>
        <p className="text-muted-foreground mt-2">{t("reviewDescription")}</p>
      </div>

      <ReviewDataFlowCard file={file} totalRows={totalRows} catalogName={catalogName} datasetNames={datasetNames} />
      <ReviewMappingsCard
        mappingsWithDataset={mappingsWithDataset}
        geocodingEnabled={geocodingEnabled}
        deduplicationStrategy={deduplicationStrategy}
      />
      <ReviewTransformsCard transforms={wizardTransforms} />
      {sourceUrl && scheduleConfig?.enabled && <ReviewScheduleCard scheduleConfig={scheduleConfig} />}

      {wizardError && (
        <div role="alert" className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          {wizardError}
        </div>
      )}

      {/* Sticky footer with Back + Start Import / Update Schedule */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t border-transparent pt-4 pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={prevStep} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Button>
          <div className="flex items-center gap-3">
            {editMode ? (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => handleUpdateSchedule(true)}
                  disabled={isUpdating}
                  className="gap-2"
                >
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  {t("updateAndRunNow")}
                </Button>
                <Button size="lg" onClick={() => handleUpdateSchedule(false)} disabled={isUpdating} className="gap-2">
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarIcon className="h-4 w-4" />}
                  {t("updateSchedule")}
                </Button>
              </>
            ) : (
              <>
                <span className={cn("text-sm", !configureMutation.isPending ? "text-accent" : "text-muted-foreground")}>
                  {t("readyToStart")}
                </span>
                <Button
                  size="lg"
                  onClick={() => void handleStartImport()}
                  disabled={configureMutation.isPending}
                  className="gap-2"
                >
                  {configureMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  {t("startImport")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
