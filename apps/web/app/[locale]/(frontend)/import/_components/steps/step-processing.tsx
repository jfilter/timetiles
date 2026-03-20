/**
 * Processing step for the import wizard.
 *
 * Shows real-time progress of the import job.
 * Displays completion summary and links to view data.
 *
 * @module
 * @category Components
 */
/* oxlint-disable complexity -- Progress polling and status handling requires multiple state transitions */
"use client";

import { Button, Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { AlertCircleIcon, CheckCircle2Icon, ExternalLinkIcon, Loader2Icon, MapIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Link } from "@/i18n/navigation";
import { type ProgressApiResponse, useImportProgressQuery } from "@/lib/hooks/use-import-progress-query";

import { useWizardStore } from "../wizard-store";

export interface StepProcessingProps {
  className?: string;
}

// Internal progress state
interface ImportProgress {
  status: "pending" | "parsing" | "processing" | "completed" | "failed";
  progress: number;
  currentStage: string;
  eventsCreated: number;
  eventsTotal: number;
  error?: string;
  completedAt?: string;
  catalogId?: number;
  datasets?: Array<{ id: number; name: string; eventsCount: number }>;
}

// Transform API response to internal progress state
const transformProgressResponse = (data: ProgressApiResponse): ImportProgress => {
  const totalEventsCreated = data.jobs.reduce((sum, job) => sum + (job.results?.totalEvents ?? 0), 0);
  const currentJob = data.jobs.find((job) => job.overallProgress < 100);
  const currentStage = currentJob?.currentStage ?? data.jobs[0]?.currentStage ?? "Processing";

  const datasets = data.jobs.map((job) => ({
    id: typeof job.datasetId === "string" ? Number.parseInt(job.datasetId, 10) : job.datasetId,
    name: job.datasetName ?? `Dataset ${job.datasetId}`,
    eventsCount: job.results?.totalEvents ?? 0,
  }));

  return {
    status: data.status,
    progress: data.overallProgress,
    currentStage,
    eventsCreated: totalEventsCreated,
    eventsTotal: 0, // Not used during processing - we show percentage instead
    error: data.errorLog ?? undefined,
    completedAt: data.completedAt ?? undefined,
    catalogId: data.catalogId ?? undefined,
    datasets: data.status === "completed" ? datasets : undefined,
  };
};

type ProcessingStatus = "completed" | "failed" | "processing";

const calculateProgressPercent = (progress: ImportProgress | null): number => {
  if (!progress) return 0;
  if (progress.eventsTotal > 0) {
    return Math.round((progress.eventsCreated / progress.eventsTotal) * 100);
  }
  return progress.progress;
};

// Helper component to render status header and avoid nested ternaries
const StatusHeader = ({ status }: { status: ProcessingStatus }) => {
  const t = useTranslations("Import");

  if (status === "completed") {
    return (
      <>
        <div className="bg-cartographic-forest/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <CheckCircle2Icon className="text-cartographic-forest h-8 w-8" />
        </div>
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">{t("importComplete")}</h2>
        <p className="text-cartographic-navy/70 mt-2">{t("importCompleteDescription")}</p>
      </>
    );
  }

  if (status === "failed") {
    return (
      <>
        <div className="bg-destructive/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <AlertCircleIcon className="text-destructive h-8 w-8" />
        </div>
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">{t("importFailed")}</h2>
        <p className="text-cartographic-navy/70 mt-2">{t("importFailedDescription")}</p>
      </>
    );
  }

  return (
    <>
      <div className="bg-cartographic-blue/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
        <Loader2Icon className="text-cartographic-blue h-8 w-8 animate-spin" />
      </div>
      <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">{t("importingData")}</h2>
      <p className="text-cartographic-navy/70 mt-2">{t("importingDataDescription")}</p>
    </>
  );
};

export const StepProcessing = ({ className }: Readonly<StepProcessingProps>) => {
  const t = useTranslations("Import");
  const tCommon = useTranslations("Common");
  const importFileId = useWizardStore((s) => s.importFileId);
  const wizardError = useWizardStore((s) => s.error);
  const complete = useWizardStore((s) => s.complete);
  const reset = useWizardStore((s) => s.reset);

  const { data: progressData, error: progressError } = useImportProgressQuery(importFileId ?? null);
  const progress = progressData ? transformProgressResponse(progressData) : null;
  const pollError = progressError instanceof Error ? progressError.message : null;

  const STAGE_LABELS: Record<string, string> = {
    UPLOAD: t("stageUploading"),
    SCHEMA_DETECTION: t("stageDetectingSchema"),
    DATASET_DETECTION: t("stageSettingUpDataset"),
    VALIDATION: t("stageValidating"),
    CREATE_EVENTS: t("stageCreatingEvents"),
    GEOCODING: t("stageGeocoding"),
    COMPLETED: t("stageComplete"),
  };

  const handleComplete = () => {
    complete();
  };

  const handleRetry = () => {
    reset();
  };

  const isCompleted = progress?.status === "completed";
  const isFailed = progress?.status === "failed" || !!wizardError;

  // Auto-clear localStorage draft when import completes
  const hasClearedRef = useRef(false);
  useEffect(() => {
    if (isCompleted && !hasClearedRef.current) {
      hasClearedRef.current = true;
      useWizardStore.persist.clearStorage();
    }
  }, [isCompleted]);
  const status: ProcessingStatus = (() => {
    if (isCompleted) return "completed";
    if (isFailed) return "failed";
    return "processing";
  })();

  // Helper functions to avoid nested ternaries
  const getStageTitle = (s: ProcessingStatus, stageLabel: string): string => {
    if (s === "completed") return t("success");
    if (s === "failed") return tCommon("error");
    return stageLabel;
  };

  const getStageDescription = (s: ProcessingStatus, p: ImportProgress | null): string => {
    if (s === "completed") {
      return t("eventsImported", { count: p?.eventsCreated?.toLocaleString() ?? "0" });
    }
    if (s === "failed") {
      return t("importCouldNotBeCompleted");
    }
    // During processing, just show stage progress without event counts
    return t("processingYourData");
  };

  const errorMessage = progress?.error ?? wizardError ?? pollError;
  const progressPercent = calculateProgressPercent(progress);
  const stageLabel = STAGE_LABELS[progress?.currentStage ?? ""] ?? progress?.currentStage ?? t("processingLabel");
  const progressBarStyle = { width: `${progressPercent}%` };

  return (
    <div className={cn("space-y-8", className)}>
      {/* Status header */}
      <div className="text-center">
        <StatusHeader status={status} />
      </div>

      {/* Progress card */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Stage indicator */}
          <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-cartographic-charcoal font-serif text-lg font-semibold">
                  {getStageTitle(status, stageLabel)}
                </p>
                <p className="text-cartographic-navy/60 text-sm">{getStageDescription(status, progress)}</p>
              </div>
              {status === "processing" && (
                <span className="text-cartographic-charcoal font-mono text-2xl font-semibold">{progressPercent}%</span>
              )}
            </div>
          </div>

          {/* Progress bar for processing */}
          {status === "processing" && (
            <div className="px-6 py-4">
              <div className="bg-cartographic-navy/10 h-2 overflow-hidden rounded-full">
                <div className="bg-cartographic-blue h-full transition-all duration-300" style={progressBarStyle} />
              </div>
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div className="border-cartographic-navy/10 border-t px-6 py-4">
              <div className="bg-destructive/10 text-destructive rounded-sm p-4 text-sm">{errorMessage}</div>
            </div>
          )}

          {/* Completion details */}
          {status === "completed" && progress?.datasets && progress.datasets.length > 0 && (
            <div className="border-cartographic-navy/10 border-t px-6 py-4">
              <p className="text-cartographic-charcoal mb-3 text-sm font-medium">{t("importedDatasets")}</p>
              <div className="space-y-2">
                {progress.datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className="bg-cartographic-cream/50 flex items-center justify-between rounded-sm px-4 py-2"
                  >
                    <span className="text-cartographic-charcoal text-sm">{dataset.name}</span>
                    <span className="text-cartographic-navy/60 font-mono text-sm">
                      {t("eventsCount", { count: dataset.eventsCount.toLocaleString() })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      {status === "completed" && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href={progress?.catalogId ? `/explore?catalog=${progress.catalogId}` : "/explore"}>
              <MapIcon className="mr-2 h-4 w-4" />
              {t("viewOnMap")}
            </Link>
          </Button>
          <Button variant="outline" size="lg" onClick={handleComplete}>
            {t("importAnotherFile")}
          </Button>
        </div>
      )}

      {status === "failed" && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={handleRetry}>
            <RefreshCwIcon className="mr-2 h-4 w-4" />
            {tCommon("tryAgain")}
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/explore">
              {t("goToMap")}
              <ExternalLinkIcon className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}

      {/* Processing info */}
      {status === "processing" && (
        <p className="text-cartographic-navy/50 text-center text-sm">
          {t("processingInfo")}
          <br />
          {t("processingInfoLeave")}
        </p>
      )}
    </div>
  );
};
