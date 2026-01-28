/**
 * Playwright global setup for E2E tests.
 *
 * Creates a test database with migrations and seed data, then starts
 * a shared Next.js server for all workers.
 *
 * @module
 * @category E2E Setup
 */

import { type ChildProcess, execSync, spawn } from "child_process";
import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables before importing database utilities
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

import { databaseExists, dropDatabase } from "@/lib/database/operations";
import { checkPostgreSQLConnection, setupDatabase } from "@/lib/database/setup";
import { constructDatabaseUrl, parseDatabaseUrl } from "@/lib/database/url";
import { createSeedManager } from "@/lib/seed/index";

import { getWorktreeBasePort, getWorktreeDatabasePrefix } from "./utils/worktree-id";

// Store processes globally for teardown
let serverProcess: ChildProcess | null = null;
let workerProcess: ChildProcess | null = null;

/**
 * Wait for a server to become available at a URL.
 * Accepts any HTTP response (not just 200 OK) to handle slow health checks.
 */
const waitForServer = async (url: string, timeout: number): Promise<void> => {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      // Accept any HTTP response - server is up even if health check returns 503
      if (response.status > 0) {
        console.log(`   Server responded with status ${response.status}`);
        return;
      }
    } catch {
      // Server not ready yet, continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Server at ${url} failed to start within ${timeout}ms`);
};

/**
 * Seed E2E test data into a database.
 */
const seedE2ETestData = async (databaseUrl: string): Promise<void> => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;

  let seedManager;
  try {
    seedManager = createSeedManager();
    await seedManager.truncate();
    await seedManager.seedWithConfig({
      preset: "e2e",
      collections: ["users", "catalogs", "datasets", "events", "pages"],
    });
    console.log("✅ Seeded E2E test data");
  } finally {
    if (seedManager) {
      await seedManager.cleanup();
    }
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
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

  // Verify PostgreSQL is running
  await checkPostgreSQLConnection();

  const dbPrefix = getWorktreeDatabasePrefix();
  const databaseName = dbPrefix; // Use prefix directly as database name
  const serverPort = getWorktreeBasePort();
  const baseURL = `http://localhost:${serverPort}`;

  // Build database URL
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL environment variable is required for E2E tests");
  }

  const components = parseDatabaseUrl(baseUrl);
  const databaseUrl = constructDatabaseUrl({ ...components, database: databaseName });

  console.log(`📦 Creating test database: ${databaseName}`);

  // Drop existing database to ensure fresh state
  if (await databaseExists(databaseName)) {
    console.log(`   Dropping existing database...`);
    await dropDatabase(databaseName);
  }

  // Create database with migrations
  await setupDatabase({
    databaseName,
    connectionString: databaseUrl,
    enablePostGIS: true,
    createPayloadSchema: true,
    runMigrations: true,
    verbose: true,
  });

  // Seed with E2E data
  await seedE2ETestData(databaseUrl);

  // Build and start production server
  const webDir = path.resolve(__dirname, "../..");
  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PAYLOAD_SECRET: "test-secret-key",
    NEXT_PUBLIC_PAYLOAD_URL: baseURL,
    NODE_ENV: "test" as const,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  // Build if no production build exists (using compile mode to skip prerendering)
  const buildIdPath = path.join(webDir, ".next", "BUILD_ID");
  const fs = await import("fs");
  if (!fs.existsSync(buildIdPath)) {
    console.log(`🔨 Building application (compile mode)...`);
    execSync(`cd "${webDir}" && pnpm build:compile`, {
      env: serverEnv,
      stdio: "inherit",
    });
  } else {
    console.log(`✅ Using existing build`);
  }

  // Check if standalone build exists (used for production/Docker deployments)
  const standaloneServerPath = path.join(webDir, ".next", "standalone", "server.js");
  const useStandalone = fs.existsSync(standaloneServerPath);

  const serverCommand = useStandalone
    ? `cd "${webDir}/.next/standalone" && PORT=${serverPort} node server.js`
    : `cd "${webDir}" && pnpm exec next start --port ${serverPort}`;

  console.log(`🚀 Starting ${useStandalone ? "standalone" : "production"} server on port ${serverPort}...`);

  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Running pnpm in controlled test setup environment
  serverProcess = spawn("sh", ["-c", serverCommand], {
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  // Log server output
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

  // Wait for server to be ready (use /explore which is simpler than /api/health)
  await waitForServer(`${baseURL}/explore`, 30000);
  console.log(`✅ Server ready at ${baseURL}`);

  // Start job worker process (runs jobs every 2 seconds, like a production worker)
  const workerPath = path.join(__dirname, "utils", "job-worker.ts");
  console.log(`⚙️ Starting job worker...`);

  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Running tsx in controlled test setup environment
  workerProcess = spawn("npx", ["tsx", workerPath], {
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    cwd: webDir,
  });

  if (workerProcess) {
    workerProcess.stdout?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        console.log(message);
      }
    });

    workerProcess.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message && !message.includes("ExperimentalWarning")) {
        console.error(message);
      }
    });
  }

  // Wait for worker to fully initialize (Payload connection takes time)
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log(`✅ Job worker started`);

  // Store server info for teardown and workers
  /* eslint-disable turbo/no-undeclared-env-vars -- E2E test environment variables set dynamically */
  process.env.E2E_SERVER_PORT = String(serverPort);
  process.env.E2E_SERVER_PID = String(serverProcess?.pid ?? "");
  process.env.E2E_WORKER_PID = String(workerProcess?.pid ?? "");
  process.env.E2E_DATABASE_NAME = databaseName;
  process.env.E2E_BASE_URL = baseURL;
  /* eslint-enable turbo/no-undeclared-env-vars */
}
