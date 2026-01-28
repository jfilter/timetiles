/**
 * Processing step for the import wizard.
 *
 * Shows real-time progress of the import job.
 * Displays completion summary and links to view data.
 *
 * @module
 * @category Components
 */
/* eslint-disable complexity -- Progress polling and status handling requires multiple state transitions */
"use client";

import { Button, Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { AlertCircleIcon, CheckCircle2Icon, ExternalLinkIcon, Loader2Icon, MapIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useWizard } from "../wizard-context";

export interface StepProcessingProps {
  className?: string;
}

// API response structure from /api/import/[importId]/progress
interface ProgressApiResponse {
  type: string;
  id: number;
  status: "pending" | "parsing" | "processing" | "completed" | "failed";
  originalName: string;
  catalogId: number | null;
  datasetsCount: number;
  datasetsProcessed: number;
  overallProgress: number;
  estimatedCompletionTime: string | null;
  jobs: Array<{
    id: string | number;
    datasetId: string | number;
    datasetName?: string;
    currentStage: string;
    overallProgress: number;
    stages?: Array<{
      name: string;
      status: string;
      progress: number;
    }>;
    results?: {
      totalEvents?: number;
    };
  }>;
  errorLog?: string | null;
  completedAt?: string | null;
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
    id: typeof job.datasetId === "string" ? parseInt(job.datasetId, 10) : job.datasetId,
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

const STAGE_LABELS: Record<string, string> = {
  UPLOAD: "Uploading",
  SCHEMA_DETECTION: "Detecting schema",
  DATASET_DETECTION: "Setting up dataset",
  VALIDATION: "Validating data",
  CREATE_EVENTS: "Creating events",
  GEOCODING: "Geocoding locations",
  COMPLETED: "Complete",
};

const calculateProgressPercent = (progress: ImportProgress | null): number => {
  if (!progress) return 0;
  if (progress.eventsTotal > 0) {
    return Math.round((progress.eventsCreated / progress.eventsTotal) * 100);
  }
  return progress.progress;
};

// Helper functions to avoid nested ternaries
const getStageTitle = (status: ProcessingStatus, stageLabel: string): string => {
  if (status === "completed") return "Success";
  if (status === "failed") return "Error";
  return stageLabel;
};

const getStageDescription = (status: ProcessingStatus, progress: ImportProgress | null): string => {
  if (status === "completed") {
    return `${progress?.eventsCreated?.toLocaleString() ?? 0} events imported`;
  }
  if (status === "failed") {
    return "Import could not be completed";
  }
  // During processing, just show stage progress without event counts
  return "Processing your data...";
};

// Helper component to render status header and avoid nested ternaries
const StatusHeader = ({ status }: { status: ProcessingStatus }) => {
  if (status === "completed") {
    return (
      <>
        <div className="bg-cartographic-forest/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <CheckCircle2Icon className="text-cartographic-forest h-8 w-8" />
        </div>
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">Import complete!</h2>
        <p className="text-cartographic-navy/70 mt-2">Your data has been successfully imported.</p>
      </>
    );
  }

  if (status === "failed") {
    return (
      <>
        <div className="bg-destructive/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <AlertCircleIcon className="text-destructive h-8 w-8" />
        </div>
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">Import failed</h2>
        <p className="text-cartographic-navy/70 mt-2">There was an error importing your data.</p>
      </>
    );
  }

  return (
    <>
      <div className="bg-cartographic-blue/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
        <Loader2Icon className="text-cartographic-blue h-8 w-8 animate-spin" />
      </div>
      <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">Importing your data</h2>
      <p className="text-cartographic-navy/70 mt-2">Please wait while we process your file.</p>
    </>
  );
};

export const StepProcessing = ({ className }: Readonly<StepProcessingProps>) => {
  const { state, complete, reset, setNavigationConfig } = useWizard();
  const { importFileId, error: wizardError } = state;

  // Hide navigation on processing step (it has custom action buttons)
  useEffect(() => {
    setNavigationConfig({
      showBack: false,
      showNext: false,
    });
    return () => setNavigationConfig({});
  }, [setNavigationConfig]);

  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // Poll for progress updates
  useEffect(() => {
    if (!importFileId) return;

    let isActive = true;
    const pollInterval = 2000; // 2 seconds

    const fetchProgress = async () => {
      try {
        const response = await fetch(`/api/import/${importFileId}/progress`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch progress");
        }

        const data = (await response.json()) as ProgressApiResponse;
        if (isActive) {
          setProgress(transformProgressResponse(data));
          setPollError(null);
        }
      } catch (err) {
        if (isActive) {
          setPollError(err instanceof Error ? err.message : "Failed to fetch progress");
        }
      }
    };

    // Initial fetch
    void fetchProgress();

    // Set up polling
    const interval = setInterval(() => {
      if (progress?.status !== "completed" && progress?.status !== "failed") {
        void fetchProgress();
      }
    }, pollInterval);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [importFileId, progress?.status]);

  const handleComplete = useCallback(() => {
    complete();
  }, [complete]);

  const handleRetry = useCallback(() => {
    reset();
  }, [reset]);

  const isCompleted = progress?.status === "completed";
  const isFailed = progress?.status === "failed" || !!wizardError;
  const status: ProcessingStatus = useMemo(() => {
    if (isCompleted) return "completed";
    if (isFailed) return "failed";
    return "processing";
  }, [isCompleted, isFailed]);

  const errorMessage = progress?.error ?? wizardError ?? pollError;
  const progressPercent = calculateProgressPercent(progress);
  const stageLabel = STAGE_LABELS[progress?.currentStage ?? ""] ?? progress?.currentStage ?? "Processing";
  const progressBarStyle = useMemo(() => ({ width: `${progressPercent}%` }), [progressPercent]);

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
              <p className="text-cartographic-charcoal mb-3 text-sm font-medium">Imported datasets</p>
              <div className="space-y-2">
                {progress.datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className="bg-cartographic-cream/50 flex items-center justify-between rounded-sm px-4 py-2"
                  >
                    <span className="text-cartographic-charcoal text-sm">{dataset.name}</span>
                    <span className="text-cartographic-navy/60 font-mono text-sm">
                      {dataset.eventsCount.toLocaleString()} events
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
              View on map
            </Link>
          </Button>
          <Button variant="outline" size="lg" onClick={handleComplete}>
            Import another file
          </Button>
        </div>
      )}

      {status === "failed" && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={handleRetry}>
            <RefreshCwIcon className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/explore">
              Go to map
              <ExternalLinkIcon className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}

      {/* Processing info */}
      {status === "processing" && (
        <p className="text-cartographic-navy/50 text-center text-sm">
          This may take a few minutes depending on the size of your file.
          <br />
          You can leave this page — we&apos;ll notify you when it&apos;s done.
        </p>
      )}
    </div>
  );
};
