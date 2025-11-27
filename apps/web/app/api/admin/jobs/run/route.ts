/**
 * API endpoint for running queued jobs.
 *
 * This endpoint is used by E2E tests to trigger job processing.
 * In production, jobs would typically be run by a scheduled cron or worker.
 *
 * POST /api/admin/jobs/run - Run queued jobs
 *
 * @module
 * @category API Routes
 */

import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { createLogger } from "@/lib/logger";
import config from "@/payload.config";

const logger = createLogger("api-admin-jobs-run");

interface RunJobsRequest {
  limit?: number;
  iterations?: number;
}

/** Fetch job stats for logging */
const fetchJobStats = async (payload: Awaited<ReturnType<typeof getPayload>>) => {
  const [payloadJobs, importJobs, importFiles] = await Promise.all([
    payload.find({ collection: "payload-jobs", limit: 1000 }),
    payload.find({ collection: "import-jobs", limit: 1000, select: { stage: true } }),
    payload.find({ collection: "import-files", limit: 100, select: { status: true } }),
  ]);
  return { payloadJobs, importJobs, importFiles };
};

/** Map import files to status summaries */
const mapFileStatuses = (docs: Array<{ id: number; status?: string | null }>) =>
  docs.map((f) => ({ id: f.id, status: f.status ?? "unknown" }));

/** Map import jobs to stage summaries */
const mapJobStages = (docs: Array<{ id: number; stage?: string | null }>) =>
  docs.map((j) => ({ id: j.id, stage: j.stage ?? "unknown" }));

/**
 * Run queued jobs.
 *
 * This endpoint is primarily for E2E testing where we need to
 * process jobs synchronously rather than via cron.
 */
export const POST = async (req: Request) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Not available in production" }, { status: 403 });
    }

    const payload = await getPayload({ config });
    const body = (await req.json().catch(() => ({}))) as RunJobsRequest;
    const limit = body.limit ?? 100;
    const iterations = body.iterations ?? 10;

    const initial = await fetchJobStats(payload);
    logger.info("Jobs run starting", {
      payloadJobsCount: initial.payloadJobs.totalDocs,
      importJobsCount: initial.importJobs.totalDocs,
      importFilesCount: initial.importFiles.totalDocs,
      importFileStatuses: mapFileStatuses(initial.importFiles.docs),
    });

    let iterationsRun = 0;
    for (let i = 0; i < iterations; i++) {
      iterationsRun++;
      await payload.jobs.run({ limit });
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const final = await fetchJobStats(payload);
    logger.info("Jobs run completed", {
      iterationsRun,
      limit,
      payloadJobsCount: final.payloadJobs.totalDocs,
      importJobsCount: final.importJobs.totalDocs,
      importFilesCount: final.importFiles.totalDocs,
      importFileStatuses: mapFileStatuses(final.importFiles.docs),
      importJobStages: mapJobStages(final.importJobs.docs),
    });

    return NextResponse.json({
      success: true,
      iterationsRun,
      debug: {
        payloadJobs: { initial: initial.payloadJobs.totalDocs, final: final.payloadJobs.totalDocs },
        importJobs: {
          initial: initial.importJobs.totalDocs,
          final: final.importJobs.totalDocs,
          stages: mapJobStages(final.importJobs.docs),
        },
        importFiles: {
          initial: initial.importFiles.totalDocs,
          final: final.importFiles.totalDocs,
          statuses: mapFileStatuses(final.importFiles.docs),
        },
      },
    });
  } catch (error) {
    logger.error("Failed to run jobs", { error });
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to run jobs", details: errorMessage }, { status: 500 });
  }
};
