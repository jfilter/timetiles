/**
 * Playwright global setup for E2E tests.
 *
 * Creates a test database with migrations and seed data, then starts
 * a shared Next.js server for all workers.
 *
 * @module
 * @category E2E Setup
 */

import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables before importing database utilities
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

import { dropDatabase, listDatabasesByPrefix } from "@/lib/database/operations";
import { checkPostgreSQLConnection, setupDatabase } from "@/lib/database/setup";
import { withDatabaseName } from "@/lib/database/url";

import { seedE2ETestData } from "./seed-e2e-data";
import { startGeocodingStubServer } from "./utils/geocoding-stub-server";
import { findAvailablePort, waitForServer, waitForWorker } from "./utils/runtime-guards";
import { getWorktreeBasePort, getWorktreeDatabasePrefix } from "./utils/worktree-id";

const cleanupStaleE2EDatabases = async (databasePrefix: string, activeDatabaseName: string): Promise<void> => {
  const staleDatabases = (await listDatabasesByPrefix(databasePrefix)).filter((name) => name !== activeDatabaseName);

  if (staleDatabases.length === 0) {
    return;
  }

  console.log(`🧹 Checking ${staleDatabases.length} older E2E database(s) for cleanup...`);
  for (const databaseName of staleDatabases) {
    try {
      // Another run can share this prefix. Never disconnect it to reclaim its database.
      await dropDatabase(databaseName, { ifExists: true, terminateConnections: false });
      console.log(`   Dropped ${databaseName}`);
    } catch (error) {
      console.warn(`   Keeping ${databaseName}; cleanup could not remove it:`, error);
    }
  }
};

/**
 * Playwright global setup function.
 *
 * 1. Creates worktree-specific test database with migrations and seed data
 * 2. Starts ONE shared Next.js server for all workers
 */
export default async function globalSetup(): Promise<void> {
  console.log("🚀 Starting E2E global setup...");

  await checkPostgreSQLConnection();

  const dbPrefix = getWorktreeDatabasePrefix();
  const databaseName = `${dbPrefix}_${process.pid}`;
  // Prefer the worktree's deterministic base port, but fall back to the next free port in
  // its lane if something else holds it (e.g. another project's container).
  const serverPort = await findAvailablePort(getWorktreeBasePort(), "E2E server");
  const baseURL = `http://localhost:${serverPort}`;

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL environment variable is required for E2E tests");
  }

  const databaseUrl = withDatabaseName(baseUrl, databaseName);

  // Start the geocoding stub before seeding so the seed can point a geocoding-providers row
  // at it. It runs in-process on an ephemeral port and is released when the runner exits.
  const stub = await startGeocodingStubServer();
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- E2E-only env var
  process.env.E2E_GEOCODING_STUB_URL = stub.url;
  console.log(`🗺️ Geocoding stub server listening at ${stub.url}`);

  console.log(`📦 Creating test database: ${databaseName}`);
  await cleanupStaleE2EDatabases(dbPrefix, databaseName);

  // Teardown must know the exact database even if migrations or startup fail.
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- E2E teardown ownership
  process.env.E2E_DATABASE_NAME = databaseName;

  await setupDatabase({
    databaseName,
    connectionString: databaseUrl,
    enablePostGIS: true,
    createPayloadSchema: true,
    runMigrations: true,
    skipIfExists: false,
    verbose: true,
  });
  console.log(`✅ setupDatabase completed`);

  // Build and start production server
  const webDir = path.resolve(__dirname, "../..");
  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PAYLOAD_SECRET: "test-secret-key",
    NEXT_PUBLIC_PAYLOAD_URL: baseURL,
    NODE_ENV: "test" as const,
    NEXT_TELEMETRY_DISABLED: "1",
    // Allow localhost URLs so E2E tests can use self-hosted test fixtures
    ALLOW_PRIVATE_URLS: "true",
    // Canonical E2E signal for runtime guards — see lib/utils/is-e2e.ts.
    E2E_MODE: "true",
  };

  // Always rebuild to ensure test binary matches current source code.
  // A stale build (e.g. from a previous branch) silently misses new features.
  const fs = await import("node:fs");

  // Build @timetiles/ui first: `next build` resolves its bare imports via `exports` → dist/,
  // which a fresh worktree never has; rebuilding also keeps dist in sync with source.
  console.log(`📦 Building @timetiles/ui (workspace package)...`);
  execSync(`cd "${webDir}" && pnpm --filter @timetiles/ui build`, { env: serverEnv, stdio: "inherit" });

  console.log(`🔨 Building application...`);
  // Generate Payload types and the import map, then compile Next.js without static generation.
  execSync(`cd "${webDir}" && pnpm build:compile`, { env: serverEnv, stdio: "inherit" });

  await seedE2ETestData(databaseUrl);

  // Check if standalone build exists (used for production/Docker deployments)
  const standaloneServerPath = path.join(webDir, ".next", "standalone", "server.js");
  const useStandalone = fs.existsSync(standaloneServerPath);

  const [serverBin, serverArgs, serverCwd] = useStandalone
    ? [process.execPath, ["server.js"], path.dirname(standaloneServerPath)]
    : [path.join(webDir, "node_modules", ".bin", "next"), ["start", "--port", String(serverPort)], webDir];

  console.log(`🚀 Starting ${useStandalone ? "standalone" : "production"} server on port ${serverPort}...`);

  const serverProcess = spawn(serverBin, serverArgs, {
    cwd: serverCwd,
    env: { ...serverEnv, PORT: String(serverPort) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  // Register ownership before readiness checks can fail.
  /* oxlint-disable turbo/no-undeclared-env-vars -- E2E teardown metadata */
  process.env.E2E_SERVER_PORT = String(serverPort);
  process.env.E2E_SERVER_PID = String(serverProcess.pid ?? "");
  /* oxlint-enable turbo/no-undeclared-env-vars */

  if (serverProcess) {
    serverProcess.stdout?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message.includes("Ready") || message.includes("Error") || message.includes("started")) {
        console.log(`[Server:${serverPort}] ${message}`);
      }
    });

    serverProcess.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message && !message.includes("ExperimentalWarning")) {
        console.error(`[Server:${serverPort}] ${message}`);
      }
    });
  }

  // Wait for server to be ready using /api/health (bypasses i18n middleware)
  await waitForServer(`${baseURL}/api/health`, 30000);
  console.log(`✅ Server ready at ${baseURL}`);

  const workerPath = path.join(__dirname, "utils", "job-worker.ts");
  console.log(`⚙️ Starting job worker...`);

  // Start the worker directly so teardown waits for its PID, not a package-manager wrapper.
  const wp = spawn(process.execPath, ["--import", "tsx", workerPath], {
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    cwd: webDir,
  });

  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- E2E teardown metadata
  process.env.E2E_WORKER_PID = String(wp.pid ?? "");

  wp.stdout?.on("data", (data: Buffer) => {
    const message = data.toString().trim();
    if (message) console.log(`[Worker] ${message}`);
  });

  wp.stderr?.on("data", (data: Buffer) => {
    const message = data.toString().trim();
    if (message && !message.includes("ExperimentalWarning")) console.error(`[Worker:ERR] ${message}`);
  });

  wp.on("exit", (code, signal) => {
    console.log(`[Worker] Process exited (code=${code}, signal=${signal})`);
  });

  await waitForWorker(wp);
  console.log(`✅ Job worker started`);

  // Publish the ready server URL to test workers.
  /* oxlint-disable turbo/no-undeclared-env-vars -- E2E test environment variables set dynamically */
  process.env.E2E_BASE_URL = baseURL;
  /* oxlint-enable turbo/no-undeclared-env-vars */
}
