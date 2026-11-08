// @vitest-environment node
/**
 * Integration tests for the late writes of a task (ADR 0043): its error message,
 * `FAILED` and `COMPLETED` land only while the IngestJob is still at the task's
 * generation, checked under the row lock that approval, retry and reset take.
 *
 * @module
 */
import { eq, sql } from "@payloadcms/db-postgres/drizzle";
import { commitTransaction, createLocalReq, initTransaction } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import { createSchemaVersionJob } from "@/lib/jobs/handlers/create-schema-version-job";
import type { TaskCallbackArgs } from "@/lib/jobs/utils/job-context";
import { recordTaskError } from "@/lib/jobs/utils/resource-loading";
import { ingest_jobs } from "@/payload-generated-schema";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "@/tests/setup/integration/environment";

describe("generation-checked task writes", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  }, 60000);

  afterAll(async () => {
    await testEnv.cleanup();
  });

  const createJob = async (generation: number) => {
    const key = `gen${crypto.randomUUID().slice(0, 8)}`;
    const { users } = await withUsers(testEnv, { [key]: { role: "editor" } });
    const { catalog } = await withCatalog(testEnv, { user: users[key]! });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: `Generation DS ${key}` });
    const { ingestFile } = await withIngestFile(testEnv, catalog.id, "id,name\n1,a\n", {
      status: "processing",
      user: users[key]!.id,
    });
    const job = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: "create-events", sheetIndex: 0, generation },
      overrideAccess: true,
    });
    return job.id;
  };

  const finalFailure = (ingestJobId: number, generation: number): TaskCallbackArgs => ({
    input: { ingestJobId, generation },
    job: { id: "job-1", error: "task failed" },
    req: { payload },
    taskStatus: { totalTried: createSchemaVersionJob.retries },
  });

  const stageOf = async (id: number) =>
    (await payload.findByID({ collection: "ingest-jobs", id, depth: 0, overrideAccess: true })).stage;

  /** Resolve once another session of this database waits on a row lock. */
  const waitForLockWaiter = async () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await payload.db.drizzle.execute(
        sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`
      );
      if (Number((result.rows[0] as { waiting: number }).waiting) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("No session waited on the row lock");
  };

  it("fails the job only while the task's generation is current", async () => {
    const stale = await createJob(2);
    await createSchemaVersionJob.onFail(finalFailure(stale, 1));
    expect(await stageOf(stale)).toBe("create-events");

    const current = await createJob(2);
    await createSchemaVersionJob.onFail(finalFailure(current, 2));
    expect(await stageOf(current)).toBe("failed");
  });

  it("completes the job only while the task's generation is current", async () => {
    const stale = await createJob(2);
    await createEventsBatchJob.onSuccess(finalFailure(stale, 1));
    expect(await stageOf(stale)).toBe("create-events");

    const current = await createJob(2);
    await createEventsBatchJob.onSuccess(finalFailure(current, 2));
    expect(await stageOf(current)).toBe("completed");
  });

  it("drops the error message of a superseded attempt", async () => {
    const id = await createJob(2);
    await recordTaskError(payload, id, new Error("old attempt"), 1);
    const job = await payload.findByID({ collection: "ingest-jobs", id, depth: 0, overrideAccess: true });
    expect(job.errorLog).toBeFalsy();
  });

  it("waits for a concurrent generation bump and then leaves the newer generation alone", async () => {
    const id = await createJob(1);
    // An approval holds the row lock while it bumps the generation.
    const approval = await createLocalReq({}, payload);
    await initTransaction(approval);
    const db = await getTransactionAwareDrizzle(payload, approval);
    await db.select({ id: ingest_jobs.id }).from(ingest_jobs).where(eq(ingest_jobs.id, id)).for("update");

    const failing = createSchemaVersionJob.onFail(finalFailure(id, 1));
    await waitForLockWaiter();
    await db.update(ingest_jobs).set({ generation: 2 }).where(eq(ingest_jobs.id, id));
    await commitTransaction(approval);
    await failing;

    expect(await stageOf(id)).toBe("create-events");
  });
});
