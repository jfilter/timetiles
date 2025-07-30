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
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";

export const GET = async (
  request: NextRequest,
  { params }: { params: { importId: string } },
): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });
    const { importId } = params;

    // First try to find as importFile
    const importFile = await payload
      .findByID({
        collection: "import-files",
        id: importId,
        depth: 0,
      })
      .catch(() => null);

    if (importFile) {
      // Get all related import jobs
      const importJobs = await payload.find({
        collection: "import-jobs",
        where: {
          importFile: {
            equals: importId,
          },
        },
        limit: 100,
      });

      // Calculate overall progress
      const jobs = importJobs.docs;
      const totalProgress =
        jobs.length > 0
          ? jobs.reduce((sum, job) => {
              const progress = job.progress?.current || 0;
              const total = job.progress?.total || 1;
              return sum + (progress / total) * 100;
            }, 0) / jobs.length
          : 0;

      const response = {
        type: "catalog",
        id: importFile.id,
        status: importFile.status,
        datasetsCount: importFile.datasetsCount,
        datasetsProcessed: importFile.datasetsProcessed,
        progress: Math.round(totalProgress),
        jobs: jobs.map((job) => ({
          id: job.id,
          datasetId: typeof job.dataset === "object" ? job.dataset.id : job.dataset,
          datasetName: typeof job.dataset === "object" ? job.dataset.name : undefined,
          stage: job.stage,
          progress:
            job.progress?.total && job.progress?.current
              ? Math.round((job.progress.current / job.progress.total) * 100)
              : 0,
          rowsTotal: job.progress?.total || 0,
          rowsProcessed: job.progress?.current || 0,
          errors: job.errors?.length || 0,
        })),
        errorLog: importFile.errorLog,
        completedAt: importFile.completedAt,
      };

      return NextResponse.json(response);
    }

    // Try to find as ImportJob (for individual dataset progress)
    const importJob = await payload
      .findByID({
        collection: "import-jobs",
        id: importId,
        depth: 1,
      })
      .catch(() => null);

    if (importJob) {
      const progress =
        importJob.progress?.total && importJob.progress?.current
          ? Math.round((importJob.progress.current / importJob.progress.total) * 100)
          : 0;

      const response = {
        type: "dataset",
        id: importJob.id,
        datasetId: typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset,
        datasetName: typeof importJob.dataset === "object" ? importJob.dataset.name : undefined,
        stage: importJob.stage,
        progress,
        rowsTotal: importJob.progress?.total || 0,
        rowsProcessed: importJob.progress?.current || 0,
        batchNumber: importJob.progress?.batchNumber || 0,
        duplicates: {
          internal: importJob.duplicates?.summary?.internalDuplicates || 0,
          external: importJob.duplicates?.summary?.externalDuplicates || 0,
        },
        schemaValidation: importJob.schemaValidation,
        geocodingProgress: importJob.geocodingProgress,
        errors: importJob.errors?.length || 0,
        results: importJob.results,
      };

      return NextResponse.json(response);
    }

    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  } catch (error) {
    logError(error, "Failed to get import progress", { importId: params.importId });

    return NextResponse.json({ error: "Failed to get import progress" }, { status: 500 });
  }
};
