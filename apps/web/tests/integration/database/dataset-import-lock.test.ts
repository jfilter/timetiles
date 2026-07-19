// @vitest-environment node
/**
 * Integration test: the per-dataset import lease serializes on REAL Postgres
 * session-level advisory locks. Verifies that same-dataset acquisitions wait for
 * each other, different-dataset acquisitions run unimpeded, and a never-released
 * lock makes a waiter time out — the guarantees the create-events handler relies
 * on to serialize concurrent update-strategy imports (see event-snapshots.ts).
 *
 * @module
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { acquireDatasetImportLease, closeDatasetLeasePool } from "@/lib/database/dataset-import-lock";
import { createLogger } from "@/lib/logger";

import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

describe.sequential("dataset import lease (real advisory locks)", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  const log = createLogger("dataset-lease-test");

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;
  });

  afterAll(async () => {
    await closeDatasetLeasePool();
    await testEnv?.cleanup();
  });

  it("serializes two concurrent acquisitions on the same dataset", async () => {
    const datasetId = 987_001;
    const lease1 = await acquireDatasetImportLease(payload, datasetId, log, { pollIntervalMs: 10 });

    let acquired2 = false;
    let lease2: Awaited<ReturnType<typeof acquireDatasetImportLease>> | undefined;
    const lease2Promise = (async () => {
      lease2 = await acquireDatasetImportLease(payload, datasetId, log, { pollIntervalMs: 10 });
      acquired2 = true;
    })();

    // The waiter polls repeatedly but must NOT acquire while lease1 is held.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(acquired2).toBe(false);

    await lease1.release();

    await lease2Promise;
    expect(acquired2).toBe(true);
    await lease2?.release();
  });

  it("does not block acquisitions on a different dataset", async () => {
    const leaseA = await acquireDatasetImportLease(payload, 987_002, log, { pollIntervalMs: 10 });
    // A different dataset key acquires within a short window; it would time out and
    // throw if it were (wrongly) blocked on 987_002's lock.
    const leaseB = await acquireDatasetImportLease(payload, 987_003, log, { pollIntervalMs: 10, maxWaitMs: 300 });
    expect(leaseB).toHaveProperty("release");
    await leaseA.release();
    await leaseB.release();
  });

  it("times out when the lock is never released", async () => {
    const held = await acquireDatasetImportLease(payload, 987_004, log, { pollIntervalMs: 10 });
    await expect(
      acquireDatasetImportLease(payload, 987_004, log, { pollIntervalMs: 10, maxWaitMs: 80 })
    ).rejects.toThrow(/Timed out/);
    await held.release();
  });
});
