/**
 * This file defines the API route for fetching the progress of a data import job.
 *
 * It provides an endpoint that clients can poll to get real-time updates on the status
 * of an import. The handler can return the overall progress of a catalog import (which may
 * involve multiple datasets and jobs) or the detailed progress of a single dataset import job.
 * This is crucial for providing feedback to the user during the import process.
 * @module
 */
import config from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import type { ImportJob } from "@/payload-types";

interface JobProgress {
  id: string | number;
  datasetId: string | number;
  datasetName?: string;
  stage: string;
  progress: number;
  rowsTotal: number;
  rowsProcessed: number;
  batchNumber: number;
  errors: number;
  duplicates: {
    internal: number;
    external: number;
  };
  schemaValidation?: ImportJob["schemaValidation"];
  geocodingProgress?: ImportJob["geocodingProgress"];
  results?: ImportJob["results"];
}

const getDatasetInfo = (dataset: ImportJob["dataset"]) => {
  if (typeof dataset === "object") {
    return { id: dataset.id, name: dataset.name };
  }
  return { id: dataset, name: undefined };
};

const calculateProgress = (current?: number, total?: number): number => {
  if (!total || !current) return 0;
  return Math.round((current / total) * 100);
};

const formatJobProgress = (job: ImportJob): JobProgress => {
  const { id: datasetId, name: datasetName } = getDatasetInfo(job.dataset);

  return {
    id: job.id,
    datasetId,
    datasetName,
    stage: job.stage,
    progress: calculateProgress(job.progress?.current ?? undefined, job.progress?.total ?? undefined),
    rowsTotal: job.progress?.total ?? 0,
    rowsProcessed: job.progress?.current ?? 0,
    batchNumber: job.progress?.batchNumber ?? 0,
    errors: job.errors?.length ?? 0,
    duplicates: {
      internal: job.duplicates?.summary?.internalDuplicates ?? 0,
      external: job.duplicates?.summary?.externalDuplicates ?? 0,
    },
    schemaValidation: job.schemaValidation,
    geocodingProgress: job.geocodingProgress,
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
          return NextResponse.json({ error: "Import not found or access denied" }, { status: 404 });
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

        // Calculate overall progress
        const overallProgress =
          jobs.length > 0
            ? jobs.reduce((sum, job) => {
                const progress = job.progress?.current ?? 0;
                const total = job.progress?.total ?? 1;
                return sum + (progress / total) * 100;
              }, 0) / jobs.length
            : 0;

        // Build comprehensive response
        const response = {
          type: "import-file",
          id: importFile.id,
          status: importFile.status,
          originalName: importFile.originalName,
          datasetsCount: importFile.datasetsCount,
          datasetsProcessed: importFile.datasetsProcessed,
          overallProgress: Math.round(overallProgress),
          jobs: jobs.map(formatJobProgress),
          errorLog: importFile.errorLog,
          completedAt: importFile.completedAt,
          createdAt: importFile.createdAt,
        };

        return NextResponse.json(response);
      } catch (error) {
        const { importId } = await context.params;
        logError(error, "Failed to get import progress", { importId });

        return NextResponse.json({ error: "Failed to get import progress" }, { status: 500 });
      }
    }
  ),
  { configName: "PROGRESS_CHECK" }
);
