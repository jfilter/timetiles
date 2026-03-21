/**
 * Playwright global teardown for E2E tests.
 *
 * Stops the shared server and cleans up the test database.
 *
 * @module
 * @category E2E Setup
 */

import path from "node:path";

import { config as loadEnv } from "dotenv";

// Load environment variables
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

import { dropDatabase } from "@/lib/database/operations";

import { getWorktreeDatabasePrefix } from "./utils/worktree-id";

/**
 * Playwright global teardown function.
 */
export default async function globalTeardown(): Promise<void> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test environment variable set by global-setup
  const serverPid = process.env.E2E_SERVER_PID;
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test environment variable set by global-setup
  const workerPid = process.env.E2E_WORKER_PID;
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test environment variable set by global-setup
  const databaseName = process.env.E2E_DATABASE_NAME ?? getWorktreeDatabasePrefix();

  // Kill worker process first (it has DB connections)
  if (workerPid) {
    console.log(`🧹 Stopping job worker (PID: ${workerPid})...`);
    try {
      process.kill(-Number(workerPid), "SIGTERM");
    } catch {
      try {
        process.kill(Number(workerPid), "SIGTERM");
      } catch {
        // Already dead
      }
    }
  }

  // Kill server process
  if (serverPid) {
    console.log(`🧹 Stopping server (PID: ${serverPid})...`);
    try {
      process.kill(-Number(serverPid), "SIGTERM");
    } catch {
      try {
        process.kill(Number(serverPid), "SIGTERM");
      } catch {
        // Already dead
      }
    }
  }

  // Wait for processes to shut down before dropping DB
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Clean up database
  console.log(`🧹 Cleaning up test database: ${databaseName}`);
  try {
    await dropDatabase(databaseName, { ifExists: true });
    console.log(`   ✓ Dropped ${databaseName}`);
  } catch (error) {
    console.warn(`   ⚠ Could not drop ${databaseName}:`, error);
  }

  console.log("✅ E2E cleanup complete");
}
