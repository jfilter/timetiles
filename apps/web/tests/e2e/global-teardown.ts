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

import { dropDatabase, listDatabasesByPrefix } from "@/lib/database/operations";

import { terminateProcess, waitForPortToBeFree } from "./utils/runtime-guards";
import { getWorktreeBasePort, getWorktreeDatabasePrefix } from "./utils/worktree-id";

/**
 * Playwright global teardown function.
 */
export default async function globalTeardown(): Promise<void> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test environment variable set by global-setup
  const serverPid = process.env.E2E_SERVER_PID;
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test environment variable set by global-setup
  const workerPid = process.env.E2E_WORKER_PID;
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test environment variable set by global-setup
  const databaseName = process.env.E2E_DATABASE_NAME;
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test environment variable set by global-setup
  const serverPort = Number(process.env.E2E_SERVER_PORT ?? getWorktreeBasePort());
  const databasePrefix = getWorktreeDatabasePrefix();

  // Note: the geocoding stub server (in-process http.Server started by
  // global-setup) is released automatically when this teardown module's
  // host process exits. It binds an ephemeral port so leaks don't conflict.

  // Kill worker process first (it has DB connections)
  if (workerPid) {
    console.log(`🧹 Stopping job worker (PID: ${workerPid})...`);
    try {
      await terminateProcess(Number(workerPid), "job worker");
    } catch (error) {
      console.warn(`   ⚠ Could not stop job worker ${workerPid}:`, error);
    }
  }

  // Kill server process
  if (serverPid) {
    console.log(`🧹 Stopping server (PID: ${serverPid})...`);
    try {
      await terminateProcess(Number(serverPid), "E2E server");
    } catch (error) {
      console.warn(`   ⚠ Could not stop server ${serverPid}:`, error);
    }
  }

  if (Number.isFinite(serverPort) && serverPort > 0) {
    try {
      await waitForPortToBeFree(serverPort);
    } catch (error) {
      console.warn(`   ⚠ Port ${serverPort} still appears busy after teardown:`, error);
    }
  }

  // Clean up database
  const databasesToDrop = databaseName ? [databaseName] : await listDatabasesByPrefix(databasePrefix);

  if (databasesToDrop.length === 0) {
    console.log(`🧹 No E2E databases found for prefix: ${databasePrefix}`);
  } else {
    for (const name of databasesToDrop) {
      console.log(`🧹 Cleaning up test database: ${name}`);
      try {
        await dropDatabase(name, { ifExists: true });
        console.log(`   ✓ Dropped ${name}`);
      } catch (error) {
        console.warn(`   ⚠ Could not drop ${name}:`, error);
      }
    }
  }

  console.log("✅ E2E cleanup complete");
}
