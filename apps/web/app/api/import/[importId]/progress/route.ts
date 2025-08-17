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
  context: { params: Promise<{ importId: string }> }
): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });
    const { importId } = await context.params;

    // Get the import file
    const importFile = await payload
      .findByID({
        collection: "import-files",
        id: importId,
        depth: 0,
      })
      .catch(() => null);

    if (!importFile) {
      return NextResponse.json({ error: "Import file not found" }, { status: 404 });
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
    });

    const jobs = importJobs.docs;

    // Calculate overall progress
    const overallProgress =
      jobs.length > 0
        ? jobs.reduce((sum, job) => {
            const progress = job.progress?.current || 0;
            const total = job.progress?.total || 1;
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
        batchNumber: job.progress?.batchNumber || 0,
        errors: job.errors?.length || 0,
        duplicates: {
          internal: job.duplicates?.summary?.internalDuplicates || 0,
          external: job.duplicates?.summary?.externalDuplicates || 0,
        },
        schemaValidation: job.schemaValidation,
        geocodingProgress: job.geocodingProgress,
        results: job.results,
      })),
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
};
