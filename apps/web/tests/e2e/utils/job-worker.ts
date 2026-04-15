/**
 * Job worker for E2E tests.
 *
 * This worker runs Payload jobs in a loop, similar to how a production
 * worker process would operate. It's spawned alongside the E2E test server.
 *
 * @module
 * @category E2E Utils
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables FIRST, before any other imports
// Note: We need to do this before importing payload.config.ts which checks env vars
loadEnv({ path: path.resolve(__dirname, "../../../.env.local") });

// Ensure required env vars are set (will be overridden by E2E setup)
process.env.PAYLOAD_SECRET ??= "test-secret-key";
process.env.NEXT_PUBLIC_PAYLOAD_URL ??= "http://localhost:3000";

const IDLE_POLL_MS = 1000; // Sleep when no jobs found
const BUSY_POLL_MS = 50; // Minimal delay between runs when processing
const MAX_JOBS_PER_RUN = 50;

let isRunning = true;

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("[job-worker] Received SIGTERM, shutting down...");
  isRunning = false;
});

process.on("SIGINT", () => {
  console.log("[job-worker] Received SIGINT, shutting down...");
  isRunning = false;
});

const main = async () => {
  console.log("[job-worker] Starting job worker...");
  // Log database URL (redacted) to verify correct database
  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbName = dbUrl.split("/").pop()?.split("?")[0] ?? "unknown";
  console.log(`[job-worker] Using database: ${dbName}`);

  // Dynamic import AFTER environment is configured
  const { getPayload } = await import("payload");
  const { default: config } = await import("../../../payload.config");

  const payload = await getPayload({ config });
  console.log("[job-worker] Connected to Payload, starting job loop...");

  let totalJobsProcessed = 0;
  let loopCount = 0;
  const HEARTBEAT_INTERVAL = 30; // Log heartbeat every N loops

  while (isRunning) {
    try {
      // Check for pending jobs before running
      const pending = await payload.find({
        collection: "payload-jobs",
        where: { completedAt: { exists: false } },
        limit: 5,
        depth: 0,
      });
      // Log details of pending jobs when stuck (pending > 0 but jobs.run finds nothing)
      if (pending.totalDocs > 0 && loopCount > 5 && loopCount % 10 === 0) {
        const jobSummary = pending.docs.map((j: any) => ({
          id: j.id,
          task: j.taskSlug,
          queue: j.queue,
          processing: j.processing,
          hasError: !!j.hasError,
          waitUntil: j.waitUntil,
          error: j.hasError ? String(j.error ?? "") : undefined,
          input: j.input,
        }));
        console.log(`[job-worker] Pending jobs detail: ${JSON.stringify(jobSummary, null, 2)}`);
      }

      // Queue any due scheduled jobs before running.
      await payload.jobs.handleSchedules({ allQueues: true });
      const result = await payload.jobs.run({ limit: MAX_JOBS_PER_RUN, allQueues: true });
      // If jobs were processed, loop immediately to pick up chained jobs
      const jobCount = result?.jobStatus ? Object.keys(result.jobStatus).length : 0;
      const hadWork = jobCount > 0;
      if (hadWork) {
        totalJobsProcessed += jobCount;
        const taskNames = result?.jobStatus
          ? Object.values(result.jobStatus)
              .map((s: any) => s.taskSlug ?? "?")
              .join(", ")
          : "";
        console.log(`[job-worker] Processed ${jobCount} job(s): [${taskNames}] (total: ${totalJobsProcessed})`);
      }
      loopCount++;
      // Log pending count whenever there are pending jobs or every heartbeat interval
      if (pending.totalDocs > 0 || loopCount % HEARTBEAT_INTERVAL === 0) {
        console.log(
          `[job-worker] Loop #${loopCount}: ${pending.totalDocs} pending, ${totalJobsProcessed} total processed`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, hadWork ? BUSY_POLL_MS : IDLE_POLL_MS));
    } catch (error) {
      // Log but don't crash - jobs may fail for valid reasons
      console.error("[job-worker] Error running jobs:", error);
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
    }
  }

  console.log("[job-worker] Shutting down...");
  process.exit(0);
};

try {
  await main();
} catch (error) {
  console.error("[job-worker] Fatal error:", error);
  process.exit(1);
}
