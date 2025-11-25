/**
 * Processing step for the import wizard.
 *
 * Shows real-time progress of the import job.
 * Displays completion summary and links to view data.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@timetiles/ui";
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
    results?: {
      eventsCreated?: number;
      eventsTotal?: number;
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
  datasets?: Array<{ id: number; name: string; eventsCount: number }>;
}

// Transform API response to internal progress state
const transformProgressResponse = (data: ProgressApiResponse): ImportProgress => {
  const totalEventsCreated = data.jobs.reduce((sum, job) => sum + (job.results?.eventsCreated ?? 0), 0);
  const totalEventsTotal = data.jobs.reduce((sum, job) => sum + (job.results?.eventsTotal ?? 0), 0);
  const currentJob = data.jobs.find((job) => job.overallProgress < 100);
  const currentStage = currentJob?.currentStage ?? data.jobs[0]?.currentStage ?? "Processing";

  const datasets = data.jobs.map((job) => ({
    id: typeof job.datasetId === "string" ? parseInt(job.datasetId, 10) : job.datasetId,
    name: job.datasetName ?? `Dataset ${job.datasetId}`,
    eventsCount: job.results?.eventsCreated ?? 0,
  }));

  return {
    status: data.status,
    progress: data.overallProgress,
    currentStage,
    eventsCreated: totalEventsCreated,
    eventsTotal: totalEventsTotal,
    error: data.errorLog ?? undefined,
    completedAt: data.completedAt ?? undefined,
    datasets: data.status === "completed" ? datasets : undefined,
  };
};

type ProcessingStatus = "completed" | "failed" | "processing";

const getStatusHeading = (status: ProcessingStatus): string => {
  if (status === "completed") return "Import complete!";
  if (status === "failed") return "Import failed";
  return "Importing your data...";
};

const getStatusDescription = (status: ProcessingStatus): string => {
  if (status === "completed") return "Your data has been successfully imported.";
  if (status === "failed") return "There was an error importing your data.";
  return "Please wait while we process your file.";
};

interface StatusIconProps {
  status: ProcessingStatus;
}

const StatusIcon = ({ status }: Readonly<StatusIconProps>) => {
  if (status === "completed") {
    return <CheckCircle2Icon className="text-primary h-12 w-12" />;
  }
  if (status === "failed") {
    return <AlertCircleIcon className="text-destructive h-12 w-12" />;
  }
  return <Loader2Icon className="text-primary h-12 w-12 animate-spin" />;
};

interface ProgressBarProps {
  percent: number;
}

const ProgressBar = ({ percent }: Readonly<ProgressBarProps>) => {
  const progressStyle = useMemo(() => ({ width: `${percent}%` }), [percent]);

  return (
    <div className="space-y-2">
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div className="bg-primary h-full transition-all duration-300" style={progressStyle} />
      </div>
      <p className="text-muted-foreground text-center text-sm">{percent}% complete</p>
    </div>
  );
};

interface DatasetListProps {
  datasets: Array<{ id: number; name: string; eventsCount: number }>;
}

const DatasetList = ({ datasets }: Readonly<DatasetListProps>) => (
  <div className="space-y-2">
    <p className="text-sm font-medium">Imported datasets:</p>
    <ul className="space-y-1">
      {datasets.map((dataset) => (
        <li key={dataset.id} className="flex items-center justify-between text-sm">
          <span>{dataset.name}</span>
          <span className="text-muted-foreground">{dataset.eventsCount.toLocaleString()} events</span>
        </li>
      ))}
    </ul>
  </div>
);

interface ActionButtonsProps {
  status: ProcessingStatus;
  onComplete: () => void;
  onRetry: () => void;
}

const ActionButtons = ({ status, onComplete, onRetry }: Readonly<ActionButtonsProps>) => {
  if (status === "completed") {
    return (
      <>
        <Button asChild>
          <Link href="/explore">
            <MapIcon className="mr-2 h-4 w-4" />
            View on map
          </Link>
        </Button>
        <Button variant="outline" onClick={onComplete}>
          Import another file
        </Button>
      </>
    );
  }

  if (status === "failed") {
    return (
      <>
        <Button onClick={onRetry}>
          <RefreshCwIcon className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/explore">
            Go to map
            <ExternalLinkIcon className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </>
    );
  }

  return null;
};

const getCardTitle = (status: ProcessingStatus, currentStage: string | undefined): string => {
  if (status === "completed") return "Success";
  if (status === "failed") return "Error";
  return currentStage ?? "Starting...";
};

const getCardDescription = (
  status: ProcessingStatus,
  eventsCreated: number | undefined,
  eventsTotal: number | undefined
): string => {
  if (status === "completed") {
    return `${eventsCreated?.toLocaleString() ?? 0} events imported`;
  }
  if (status === "failed") {
    return "Import could not be completed";
  }
  return `${eventsCreated ?? 0} of ${eventsTotal ?? "..."} events`;
};

const calculateProgressPercent = (progress: ImportProgress | null): number => {
  if (!progress) return 0;
  if (progress.eventsTotal > 0) {
    return Math.round((progress.eventsCreated / progress.eventsTotal) * 100);
  }
  return progress.progress;
};

export const StepProcessing = ({ className }: Readonly<StepProcessingProps>) => {
  const { state, complete, reset } = useWizard();
  const { importFileId, error: wizardError } = state;

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
    // Could redirect to explore page or datasets
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

  // Calculate progress percentage
  const progressPercent = calculateProgressPercent(progress);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-2xl font-semibold">{getStatusHeading(status)}</h2>
        <p className="text-muted-foreground mt-2">{getStatusDescription(status)}</p>
      </div>

      {/* Progress card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <StatusIcon status={status} />
            <div>
              <CardTitle>{getCardTitle(status, progress?.currentStage)}</CardTitle>
              <CardDescription>
                {getCardDescription(status, progress?.eventsCreated, progress?.eventsTotal)}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          {status === "processing" && <ProgressBar percent={progressPercent} />}

          {/* Error message */}
          {errorMessage && (
            <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{errorMessage}</div>
          )}

          {/* Completion details */}
          {status === "completed" && progress?.datasets && progress.datasets.length > 0 && (
            <DatasetList datasets={progress.datasets} />
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <ActionButtons status={status} onComplete={handleComplete} onRetry={handleRetry} />
      </div>

      {/* Processing info */}
      {status === "processing" && (
        <p className="text-muted-foreground text-center text-sm">
          This may take a few minutes depending on the size of your file.
          <br />
          You can leave this page - we&apos;ll notify you when it&apos;s done.
        </p>
      )}
    </div>
  );
};
