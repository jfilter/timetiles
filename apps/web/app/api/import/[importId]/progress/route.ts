/**
 * API route for fetching detailed progress of import jobs with per-stage tracking.
 *
 * This endpoint provides comprehensive progress information including:
 * - Overall weighted progress across all jobs
 * - Per-job progress with detailed stage breakdowns
 * - Batch information (current/total batches, within-batch progress)
 * - Performance metrics (processing rates, ETAs)
 * - Stage timeline with completion status
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { STAGE_DISPLAY_NAMES, STAGE_TIME_WEIGHTS } from "@/lib/constants/stage-time-weights";
import { logError } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import type { StageProgress } from "@/lib/types/progress-tracking";
import { internalError, notFound } from "@/lib/utils/api-response";
import config from "@/payload.config";
import type { ImportJob } from "@/payload-types";

/**
 * Formatted stage information for API response.
 */
interface FormattedStage {
  name: string;
  displayName: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  progress: number;
  weight: number;
  startedAt: string | null;
  completedAt: string | null;
  batches: {
    current: number;
    total: number;
  };
  currentBatch: {
    rowsProcessed: number;
    rowsTotal: number;
    percentage: number;
  };
  performance: {
    rowsPerSecond: number | null;
    estimatedSecondsRemaining: number | null;
  };
}

/**
 * Formatted job progress for API response.
 */
interface FormattedJobProgress {
  id: string | number;
  datasetId: string | number;
  datasetName?: string;
  currentStage: string;
  overallProgress: number;
  estimatedCompletionTime: string | null;
  stages: FormattedStage[];
  errors: number;
  duplicates: {
    internal: number;
    external: number;
  };
  schemaValidation?: ImportJob["schemaValidation"];
  results?: ImportJob["results"];
}

/**
 * Get dataset information from job.
 */
const getDatasetInfo = (dataset: ImportJob["dataset"]) => {
  if (typeof dataset === "object") {
    return { id: dataset.id, name: dataset.name };
  }
  return { id: dataset, name: undefined };
};

/**
 * Calculate stage progress percentage.
 */
const calculateStagePercentage = (stage: StageProgress): number => {
  if (stage.status === "completed" || stage.status === "skipped") {
    return 100;
  }
  if (stage.status === "in_progress" && stage.rowsTotal > 0) {
    return Math.round((stage.rowsProcessed / stage.rowsTotal) * 100);
  }
  return 0;
};

/**
 * Calculate current batch progress percentage.
 */
const calculateBatchPercentage = (stage: StageProgress): number => {
  if (stage.currentBatchTotal === 0) return 0;
  return Math.round((stage.currentBatchRows / stage.currentBatchTotal) * 100);
};

/**
 * Format a single stage for API response.
 */
const formatStage = (stageName: string, stageData: StageProgress): FormattedStage => {
  return {
    name: stageName,
    displayName: STAGE_DISPLAY_NAMES[stageName as keyof typeof STAGE_DISPLAY_NAMES] || stageName,
    status: stageData.status,
    progress: calculateStagePercentage(stageData),
    weight: STAGE_TIME_WEIGHTS[stageName as keyof typeof STAGE_TIME_WEIGHTS] || 0,
    startedAt: stageData.startedAt ? new Date(stageData.startedAt).toISOString() : null,
    completedAt: stageData.completedAt ? new Date(stageData.completedAt).toISOString() : null,
    batches: {
      current: stageData.batchesProcessed,
      total: stageData.batchesTotal,
    },
    currentBatch: {
      rowsProcessed: stageData.currentBatchRows,
      rowsTotal: stageData.currentBatchTotal,
      percentage: calculateBatchPercentage(stageData),
    },
    performance: {
      rowsPerSecond: stageData.rowsPerSecond,
      estimatedSecondsRemaining: stageData.estimatedSecondsRemaining,
    },
  };
};

/**
 * Format job progress with detailed stage information.
 */
const formatJobProgress = (job: ImportJob): FormattedJobProgress => {
  const { id: datasetId, name: datasetName } = getDatasetInfo(job.dataset);

  // Get stages from new progress structure
  const stages = (job.progress?.stages as Record<string, StageProgress> | undefined) ?? {};
  const overallPercentage = (job.progress?.overallPercentage as number | undefined) ?? 0;
  const estimatedCompletionTime = (job.progress?.estimatedCompletionTime as Date | undefined) ?? null;

  // Format all stages
  const formattedStages = Object.entries(stages).map(([stageName, stageData]) => formatStage(stageName, stageData));

  return {
    id: job.id,
    datasetId,
    datasetName,
    currentStage: job.stage,
    overallProgress: Math.round(overallPercentage),
    estimatedCompletionTime: estimatedCompletionTime ? new Date(estimatedCompletionTime).toISOString() : null,
    stages: formattedStages,
    errors: job.errors?.length ?? 0,
    duplicates: {
      internal: job.duplicates?.summary?.internalDuplicates ?? 0,
      external: job.duplicates?.summary?.externalDuplicates ?? 0,
    },
    schemaValidation: job.schemaValidation,
    results: job.results,
  };
};

export const GET = withRateLimit(
  withAuth(
    async (
      request: AuthenticatedRequest,
      context: { params: Promise<{ importId: string }> }
    ): Promise<NextResponse> => {
      try {
        const payload = await getPayload({ config });

        const { importId } = await context.params;

        // Get the import file with access control enforced
        const importFile = await payload
          .findByID({
            collection: "import-files",
            id: importId,
            depth: 0,
            user: request.user,
            overrideAccess: false,
          })
          .catch(() => null);

        if (!importFile) {
          return notFound("Import not found or access denied");
        }

        // Get all related import jobs with dataset details
        const importJobs = await payload.find({
          collection: "import-jobs",
          where: {
            importFile: {
              equals: importId,
            },
          },
          limit: 100,
          depth: 1, // Include dataset details
          user: request.user,
          overrideAccess: false,
        });

        const jobs = importJobs.docs;

        // Calculate overall progress as average of all job progress percentages
        const overallProgress =
          jobs.length > 0
            ? jobs.reduce((sum, job) => {
                const jobProgress = (job.progress?.overallPercentage as number | undefined) ?? 0;
                return sum + jobProgress;
              }, 0) / jobs.length
            : 0;

        // Get earliest estimated completion time
        const estimatedCompletionTime = jobs
          .map((job) => job.progress?.estimatedCompletionTime as Date | undefined)
          .filter((time): time is Date => time != null)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];

        // Build comprehensive response
        const response = {
          type: "import-file",
          id: importFile.id,
          status: importFile.status,
          originalName: importFile.originalName,
          datasetsCount: importFile.datasetsCount,
          datasetsProcessed: importFile.datasetsProcessed,
          overallProgress: Math.round(overallProgress),
          estimatedCompletionTime: estimatedCompletionTime ? new Date(estimatedCompletionTime).toISOString() : null,
          jobs: jobs.map(formatJobProgress),
          errorLog: importFile.errorLog,
          completedAt: importFile.completedAt,
          createdAt: importFile.createdAt,
        };

        return NextResponse.json(response);
      } catch (error) {
        const { importId } = await context.params;
        logError(error, "Failed to get import progress", { importId });

        return internalError("Failed to get import progress");
      }
    }
  ),
  { configName: "PROGRESS_CHECK" }
);
