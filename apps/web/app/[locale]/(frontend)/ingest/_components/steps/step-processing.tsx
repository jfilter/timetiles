/**
 * Processing step for the import wizard.
 *
 * Shows real-time progress of the import job via a vertical stage timeline.
 * Displays completion summary and links to view data.
 *
 * @module
 * @category Components
 */
/* oxlint-disable complexity -- Progress polling and status handling requires multiple state transitions */
"use client";

import { Button, Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MapIcon,
  MinusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Link, useRouter } from "@/i18n/navigation";
import { type ProgressApiResponse, useIngestProgressQuery } from "@/lib/hooks/use-ingest-progress-query";

import { useWizardStore } from "../wizard-store";

export interface StepProcessingProps {
  className?: string;
}

type StageStatus = "pending" | "in_progress" | "completed" | "skipped";

interface FormattedStage {
  name: string;
  displayName: string;
  status: StageStatus;
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  batches: { current: number; total: number };
  currentBatch: { rowsProcessed: number; rowsTotal: number; percentage: number };
  performance: { rowsPerSecond: number | null; estimatedSecondsRemaining: number | null };
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
  stages: FormattedStage[];
}

const formatDuration = (startedAt: string | null, completedAt: string | null): string | null => {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
};

const formatTimeRemaining = (seconds: number | null): string | null => {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `~${mins}m ${secs}s`;
};

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

  const firstJob = data.jobs[0];
  const stages: FormattedStage[] = (firstJob?.stages ?? []).map((s) => ({
    name: s.name,
    displayName: s.displayName,
    status: s.status,
    progress: s.progress,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    batches: s.batches,
    currentBatch: s.currentBatch,
    performance: s.performance,
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
    stages,
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

// --- Stage timeline components ---

const StageIndicator = ({ status }: { status: StageStatus }) => {
  if (status === "completed") {
    return <CheckCircle2Icon className="text-cartographic-forest h-5 w-5 shrink-0" />;
  }
  if (status === "in_progress") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="bg-cartographic-blue/30 absolute h-full w-full animate-ping rounded-full" />
        <span className="bg-cartographic-blue relative h-3 w-3 rounded-full" />
      </span>
    );
  }
  if (status === "skipped") {
    return <MinusIcon className="text-cartographic-navy/40 h-5 w-5 shrink-0" />;
  }
  return <CircleIcon className="text-cartographic-navy/30 h-5 w-5 shrink-0" />;
};

const StageDetails = ({ stage }: { stage: FormattedStage }) => {
  const t = useTranslations("Ingest");

  const { batches, performance } = stage;
  const timeRemaining = formatTimeRemaining(performance.estimatedSecondsRemaining);

  const detailParts: string[] = [];
  if (batches.total > 0) {
    detailParts.push(t("stageBatchProgress", { current: batches.current, total: batches.total }));
  }
  if (performance.rowsPerSecond != null && performance.rowsPerSecond > 0) {
    detailParts.push(t("stageRowsPerSecond", { count: Math.round(performance.rowsPerSecond) }));
  }
  if (timeRemaining) {
    detailParts.push(t("stageTimeRemaining", { time: timeRemaining }));
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      {/* Mini progress bar */}
      <div className="bg-cartographic-navy/10 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-cartographic-blue h-full transition-all duration-300"
          style={{ width: `${stage.progress}%` }}
        />
      </div>
      {/* Detail text */}
      {detailParts.length > 0 && (
        <p className="text-cartographic-navy/50 font-mono text-xs">{detailParts.join(" \u00B7 ")}</p>
      )}
    </div>
  );
};

/** Map API stage names (lowercase-kebab from DB) to i18n keys for display. */
const STAGE_I18N_KEYS: Record<string, string> = {
  "analyze-duplicates": "stageAnalyzingDuplicates",
  "detect-schema": "stageDetectingSchema",
  "validate-schema": "stageValidating",
  "needs-review": "stageAwaitingApproval",
  "create-schema-version": "stageSettingUpDataset",
  "geocode-batch": "stageGeocoding",
  "create-events": "stageCreatingEvents",
  completed: "stageComplete",
};

const StageRow = ({ stage, isLast }: { stage: FormattedStage; isLast: boolean }) => {
  const t = useTranslations("Ingest");
  const duration = formatDuration(stage.startedAt, stage.completedAt);
  const i18nKey = STAGE_I18N_KEYS[stage.name];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key lookup from API stage name
  const stageName = i18nKey ? t(i18nKey as any) : stage.displayName;

  // Determine the line segment style: solid for completed/in_progress, dashed for pending
  const lineBelow = !isLast;
  const lineBelowStyle =
    stage.status === "completed" || stage.status === "in_progress"
      ? "border-cartographic-navy/20"
      : "border-dashed border-cartographic-navy/15";

  return (
    <div className="flex gap-3">
      {/* Timeline column: indicator + connecting line */}
      <div className="flex flex-col items-center">
        <StageIndicator status={stage.status} />
        {lineBelow && <div className={cn("mt-1 min-h-4 w-px flex-1 border-l", lineBelowStyle)} />}
      </div>

      {/* Content column */}
      <div className={cn("flex-1 pb-3", isLast && "pb-0")}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              stage.status === "completed" && "text-cartographic-charcoal",
              stage.status === "in_progress" && "text-cartographic-blue",
              stage.status === "pending" && "text-cartographic-navy/40",
              stage.status === "skipped" && "text-cartographic-navy/40 line-through"
            )}
          >
            {stageName}
          </span>
          {stage.status === "completed" && duration && (
            <span className="text-cartographic-navy/50 shrink-0 font-mono text-xs">{duration}</span>
          )}
          {stage.status === "skipped" && (
            <span className="text-cartographic-navy/40 shrink-0 font-mono text-xs">{t("stageSkipped")}</span>
          )}
        </div>
        {stage.status === "in_progress" && <StageDetails stage={stage} />}
      </div>
    </div>
  );
};

const StageTimeline = ({ stages }: { stages: FormattedStage[] }) => {
  const visible = stages.filter((s) => s.status !== "skipped" && s.name !== "needs-review");
  return (
    <div className="space-y-1 px-6 py-4">
      {visible.map((stage, index) => (
        <StageRow key={stage.name} stage={stage} isLast={index === visible.length - 1} />
      ))}
    </div>
  );
};

// --- Status header (unchanged) ---

// Helper component to render status header and avoid nested ternaries
const StatusHeader = ({ status }: { status: ProcessingStatus }) => {
  const t = useTranslations("Ingest");

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

// --- Main component ---

export const StepProcessing = ({ className }: Readonly<StepProcessingProps>) => {
  const t = useTranslations("Ingest");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const ingestFileId = useWizardStore((s) => s.ingestFileId);
  const wizardError = useWizardStore((s) => s.error);
  const complete = useWizardStore((s) => s.complete);
  const reset = useWizardStore((s) => s.reset);

  const { data: progressData, error: progressError } = useIngestProgressQuery(ingestFileId ?? null);
  const progress = progressData ? transformProgressResponse(progressData) : null;
  const pollError = progressError instanceof Error ? progressError.message : null;

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

  // Reset full in-memory state when leaving the page after a completed import.
  // Covers navigation via browser back, nav links, etc. — not just button clicks.
  useEffect(() => {
    return () => {
      if (hasClearedRef.current) {
        useWizardStore.getState().reset();
      }
    };
  }, []);
  const status: ProcessingStatus = (() => {
    if (isCompleted) return "completed";
    if (isFailed) return "failed";
    return "processing";
  })();

  const errorMessage = progress?.error ?? wizardError ?? pollError;
  const progressPercent = calculateProgressPercent(progress);
  const currentStageKey = STAGE_I18N_KEYS[progress?.currentStage ?? ""];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key lookup from API stage name
  const stageLabel = currentStageKey ? t(currentStageKey as any) : (progress?.currentStage ?? t("processingLabel"));
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
          {/* Stage timeline — visible during processing and after completion */}
          {(status === "processing" || status === "completed") && progress?.stages && progress.stages.length > 0 && (
            <StageTimeline stages={progress.stages} />
          )}

          {/* Fallback: simple progress for when stages aren't available yet */}
          {status === "processing" && (!progress?.stages || progress.stages.length === 0) && (
            <div className="px-6 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-cartographic-navy/70 text-sm">{stageLabel}</span>
                <span className="text-cartographic-charcoal font-mono text-sm">{progressPercent}%</span>
              </div>
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
          <Button
            size="lg"
            onClick={() => {
              reset();
              router.push(progress?.catalogId ? `/explore?catalog=${progress.catalogId}` : "/explore");
            }}
          >
            <MapIcon className="mr-2 h-4 w-4" />
            {t("viewOnMap")}
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
