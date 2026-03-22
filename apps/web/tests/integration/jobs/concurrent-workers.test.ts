/**
 * Integration test: two real worker processes race for queued jobs.
 *
 * Spawns two separate Node.js processes, each with its own Payload instance
 * and connection pool — matching how production workers operate. This tests
 * whether Payload's job claim mechanism (updateJobs) is truly atomic.
 *
 * Related: https://github.com/payloadcms/payload/pull/13549
 *
 * @module
 * @category Integration Tests
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  withCatalog,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

/**
 * Spawn a worker that calls payload.jobs.run() once and exits with
 * a JSON result on stdout.
 */
const spawnWorker = (
  databaseUrl: string,
  limit: number,
  cwd: string
): Promise<{ stdout: string; stderr: string; code: number | null }> => {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, "_worker-script.ts");

    const child = spawn("npx", ["tsx", scriptPath], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        WORKER_LIMIT: String(limit),
        PAYLOAD_SECRET: "test-secret-key",
        NEXT_PUBLIC_PAYLOAD_URL: "http://localhost:3000",
        NODE_OPTIONS: "--no-warnings",
      },
      stdio: ["ignore", "pipe", "pipe"],
      cwd,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });

    // Safety timeout
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() + "\n[KILLED: timeout]", code: -1 });
    }, 120000);
  });
};

describe.sequential("Concurrent Job Workers (Real Processes)", () => {
  const collectionsToReset = [...IMPORT_PIPELINE_COLLECTIONS_TO_RESET, "catalogs"];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testUserId: string | number;
  let fileBuffer: Buffer;
  let databaseUrl: string;
  let webDir: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;
    databaseUrl = process.env.DATABASE_URL!;
    webDir = path.resolve(__dirname, "../../..");

    const { users } = await withUsers(testEnv, { worker: { role: "admin" } });
    testUserId = users.worker.id;

    const fixturePath = path.join(__dirname, "../../fixtures/events-german.csv");
    fileBuffer = fs.readFileSync(fixturePath);
  }, 60000);

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
  }, 60000);

  it("two real worker processes should claim different jobs", async () => {
    const { catalog } = await withCatalog(testEnv, { name: "Real Workers Test", user: { id: testUserId } as any });
    const catalogId = Number(catalog.id);

    // Create 2 import files → 2 dataset-detection jobs auto-queued
    for (let i = 0; i < 2; i++) {
      await withIngestFile(testEnv, catalogId, fileBuffer, {
        filename: `real-worker-${i}.csv`,
        mimeType: "text/csv",
        datasetsCount: 0,
        datasetsProcessed: 0,
        user: testUserId,
      });
    }

    // Verify 2 pending workflow jobs (manual-ingest workflows, one per file)
    const pending = await payload.find({
      collection: "payload-jobs",
      where: { workflowSlug: { equals: "manual-ingest" }, processing: { equals: false } },
    });
    expect(pending.docs).toHaveLength(2);

    // Spawn TWO real worker processes — each gets its own Payload + pool
    // Use limit:2 to handle case where one worker starts faster and both jobs are available
    const [w1, w2] = await Promise.all([spawnWorker(databaseUrl, 2, webDir), spawnWorker(databaseUrl, 2, webDir)]);

    // Parse worker results
    const parseResult = (w: { stdout: string; stderr: string; code: number | null }, label: string) => {
      const lines = w.stdout.split("\n");
      const jsonLine = lines.find((l) => l.startsWith("{"));
      if (!jsonLine) {
        // Log stderr for debugging
        const stderrPreview = w.stderr.slice(-1000);
        throw new Error(`${label} no JSON output (code=${w.code})\nstderr: ${stderrPreview}`);
      }
      return JSON.parse(jsonLine) as { jobIds: string[]; noJobsRemaining: boolean; error?: string };
    };

    const r1 = parseResult(w1, "Worker 1");
    const r2 = parseResult(w2, "Worker 2");

    // Combine results — both workers together should have processed all 2 jobs
    const allClaimedIds = [...r1.jobIds, ...r2.jobIds];
    const uniqueClaimedIds = new Set(allClaimedIds);

    // CRITICAL: no duplicate processing — each job claimed by exactly one worker
    expect(uniqueClaimedIds.size).toBe(allClaimedIds.length);
    // Together they should have claimed both jobs (distribution may vary: 2+0 or 1+1)
    expect(allClaimedIds.length).toBeGreaterThanOrEqual(2);

    // Drain follow-up jobs
    for (let i = 0; i < 10; i++) {
      const r = await payload.jobs.run({ allQueues: true, limit: 10 });
      if (r.noJobsRemaining) break;
    }

    // Each import file should have exactly ONE import-job
    const importJobs = await payload.find({ collection: "ingest-jobs", limit: 100 });
    expect(importJobs.docs).toHaveLength(2);
  }, 180000);
});
