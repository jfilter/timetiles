/**
 * Job worker for E2E tests.
 *
 * This worker runs Payload jobs in a loop, similar to how a production
 * worker process would operate. It's spawned alongside the E2E test server.
 *
 * @module
 * @category E2E Utils
 */

import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables FIRST, before any other imports
// Note: We need to do this before importing payload.config.ts which checks env vars
loadEnv({ path: path.resolve(__dirname, "../../../.env.local") });

// Ensure required env vars are set (will be overridden by E2E setup)
if (!process.env.PAYLOAD_SECRET) {
  process.env.PAYLOAD_SECRET = "test-secret-key";
}
if (!process.env.NEXT_PUBLIC_PAYLOAD_URL) {
  process.env.NEXT_PUBLIC_PAYLOAD_URL = "http://localhost:3000";
}

const POLL_INTERVAL_MS = 2000; // Run jobs every 2 seconds
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

  while (isRunning) {
    try {
      await payload.jobs.run({ limit: MAX_JOBS_PER_RUN });
    } catch (error) {
      // Log but don't crash - jobs may fail for valid reasons
      console.error("[job-worker] Error running jobs:", error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log("[job-worker] Shutting down...");
  process.exit(0);
};

main().catch((error) => {
  console.error("[job-worker] Fatal error:", error);
  process.exit(1);
});
