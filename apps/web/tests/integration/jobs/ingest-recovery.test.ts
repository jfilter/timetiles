// @vitest-environment node
/**
 * Integration tests for the recovery of ingest work whose worker died (ADR 0043):
 * live, backing-off and paused work stays untouched, crashed and orphaned sheets
 * are requeued until their attempts are used up, obsolete jobs are only closed,
 * and the report mode changes nothing but the run history.
 *
 * @module
 */
import { and, count, eq, sql } from "@payloadcms/db-postgres/drizzle";
import { commitTransaction, createLocalReq, initTransaction } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ResumePoint } from "@/lib/constants/review-reasons";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { reserveEventQuota } from "@/lib/ingest/event-quota-ledger";
import { assertNoLiveIngestTask } from "@/lib/ingest/ingest-lease";
import { queueIngestProcess } from "@/lib/ingest/ingest-runs";
import { ingestRecoveryJob } from "@/lib/jobs/handlers/ingest-recovery-job";
import { applyIngestRecovery, findIngestRecoveries, runIngestRecovery } from "@/lib/jobs/utils/ingest-recovery";
import { withJobHeartbeat } from "@/lib/jobs/utils/job-heartbeat";
import { createQuotaService } from "@/lib/services/quota-service";
import { events, ingest_jobs, payload_jobs } from "@/payload-generated-schema";
import type { IngestJob } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "@/tests/setup/integration/environment";

describe("ingest recovery", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  }, 60000);

  afterAll(async () => {
    await testEnv.cleanup();
  });

  const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const setup = async (stage: IngestJob["stage"] = "create-schema-version") => {
    const key = `rec${crypto.randomUUID().slice(0, 8)}`;
    const { users } = await withUsers(testEnv, {
      [key]: { role: "editor", customQuotas: { maxTotalEvents: 100, maxEventsPerImport: 1000 } },
    });
    const user = users[key]!;
    const { catalog } = await withCatalog(testEnv, { user });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: `Recovery DS ${key}` });
    const { ingestFile } = await withIngestFile(testEnv, catalog.id, "id,name\n1,a\n", {
      status: "processing",
      user: user.id,
    });
    const job = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile.id, dataset: dataset.id, stage, sheetIndex: 0 },
      overrideAccess: true,
    });
    return { id: job.id, user, datasetId: dataset.id };
  };

  /** Queue a child the way dispatch does and return its Payload job. */
  const queueChild = async (ingestJobId: number, resumeFrom: ResumePoint = "create-schema-version") => {
    const req = await createLocalReq({}, payload);
    await initTransaction(req);
    const generation = await queueIngestProcess(req, ingestJobId, resumeFrom);
    await commitTransaction(req);
    const [row] = await payload.db.drizzle
      .select({ id: payload_jobs.id })
      .from(payload_jobs)
      .where(
        and(
          sql`${payload_jobs.input} ->> 'ingestJobId' = ${String(ingestJobId)}`,
          sql`(${payload_jobs.input} ->> 'generation')::int = ${generation}`
        )
      );
    return { payloadJobId: row!.id, generation };
  };

  /** A worker claimed the job and then died an hour ago. */
  const crash = (payloadJobId: number, updatedAt: string = hourAgo()) =>
    payload.db.drizzle
      .update(payload_jobs)
      .set({ processing: true, updatedAt })
      .where(eq(payload_jobs.id, payloadJobId));

  const ageSheet = (ingestJobId: number) =>
    payload.db.drizzle.update(ingest_jobs).set({ updatedAt: hourAgo() }).where(eq(ingest_jobs.id, ingestJobId));

  const findingsFor = async (...ids: number[]) =>
    (await findIngestRecoveries(payload)).filter((finding) => ids.includes(Number(finding.ingestJobId)));

  const sheet = (id: number) => payload.findByID({ collection: "ingest-jobs", id, depth: 0, overrideAccess: true });

  const jobState = async (payloadJobId: number) => {
    const [row] = await payload.db.drizzle
      .select({ processing: payload_jobs.processing, hasError: payload_jobs.hasError })
      .from(payload_jobs)
      .where(eq(payload_jobs.id, payloadJobId));
    return row;
  };

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

  const runRows = async () =>
    (await payload.count({ collection: "ingest-recovery-runs", overrideAccess: true })).totalDocs;

  it("writes no run history when nothing is abandoned", async () => {
    const before = await runRows();
    const report = await runIngestRecovery(payload, { apply: false });
    expect(report.findings).toEqual([]);
    expect(await runRows()).toBe(before);
  });

  it("reports only the crashed child, not live, backing-off or paused work, and changes nothing", async () => {
    const crashed = await setup();
    const { payloadJobId: crashedJob, generation } = await queueChild(crashed.id);
    await crash(crashedJob);

    const live = await setup();
    await crash((await queueChild(live.id)).payloadJobId, new Date().toISOString());

    const backingOff = await setup();
    const { payloadJobId: waitingJob } = await queueChild(backingOff.id);
    await payload.db.drizzle
      .update(payload_jobs)
      .set({ waitUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
      .where(eq(payload_jobs.id, waitingJob));
    await ageSheet(backingOff.id);

    const paused = await setup("needs-review");
    await ageSheet(paused.id);

    const findings = await findingsFor(crashed.id, live.id, backingOff.id, paused.id);
    expect(findings).toEqual([
      expect.objectContaining({ kind: "abandoned", action: "requeue", ingestJobId: crashed.id, generation }),
    ]);

    const before = await runRows();
    const report = await runIngestRecovery(payload, { apply: false });
    expect(report.mode).toBe("report");
    expect(await runRows()).toBe(before + 1);
    expect((await sheet(crashed.id)).generation).toBe(generation);
    expect(await jobState(crashedJob)).toEqual({ processing: true, hasError: false });
  });

  it("runs hourly as a report that leaves the crashed sheet untouched", async () => {
    const { id } = await setup();
    const { payloadJobId, generation } = await queueChild(id);
    await crash(payloadJobId);
    const before = await runRows();

    const result = await ingestRecoveryJob.handler({ req: { payload } });

    expect(result.output.found).toBeGreaterThanOrEqual(1);
    expect(await runRows()).toBe(before + 1);
    expect(await jobState(payloadJobId)).toEqual({ processing: true, hasError: false });
    expect((await sheet(id)).generation).toBe(generation);
  });

  it("requeues a crashed sheet once and fails it when its attempts are used up", async () => {
    const { id } = await setup();
    const first = await queueChild(id);
    await crash(first.payloadJobId);

    const [requeue] = await findingsFor(id);
    const report = await runIngestRecovery(payload, { apply: true });
    expect(report.findings.find((finding) => finding.ingestJobId === id)?.outcome).toBe("requeued");
    expect(requeue?.resumeFrom).toBe("create-schema-version");
    expect(await jobState(first.payloadJobId)).toEqual({ processing: false, hasError: true });
    const requeued = await sheet(id);
    expect(requeued.generation).toBe(first.generation + 1);
    expect(requeued.recoveryAttempts).toBe(1);

    // The requeued child dies too; create-schema-version grants one retry, now used.
    const [second] = await payload.db.drizzle
      .select({ id: payload_jobs.id })
      .from(payload_jobs)
      .where(
        sql`(${payload_jobs.input} ->> 'generation')::int = ${first.generation + 1} and ${payload_jobs.input} ->> 'ingestJobId' = ${String(id)}`
      );
    await crash(second!.id);
    expect(await findingsFor(id)).toEqual([expect.objectContaining({ kind: "abandoned", action: "fail" })]);
    await runIngestRecovery(payload, { apply: true });

    const failed = await sheet(id);
    expect(failed.stage).toBe("failed");
    expect(failed.errorLog).toEqual(expect.objectContaining({ context: "ingest-recovery" }));
    expect(await jobState(second!.id)).toEqual({ processing: false, hasError: true });
  });

  it("leaves a job alone whose worker beats again before the finding is applied", async () => {
    const { id } = await setup();
    const { payloadJobId, generation } = await queueChild(id);
    await crash(payloadJobId);
    const [finding] = await findingsFor(id);
    await crash(payloadJobId, new Date().toISOString());

    expect((await applyIngestRecovery(payload, finding!)).outcome).toBe("skipped");
    expect(await jobState(payloadJobId)).toEqual({ processing: true, hasError: false });
    expect((await sheet(id)).generation).toBe(generation);
  });

  it("closes a dead child of a superseded generation without touching its sheet", async () => {
    const { id } = await setup();
    const { payloadJobId, generation } = await queueChild(id);
    await crash(payloadJobId);
    await payload.db.drizzle
      .update(ingest_jobs)
      .set({ generation: generation + 1 })
      .where(eq(ingest_jobs.id, id));

    expect(await findingsFor(id)).toEqual([expect.objectContaining({ kind: "obsolete", action: "close" })]);
    await runIngestRecovery(payload, { apply: true });

    expect(await jobState(payloadJobId)).toEqual({ processing: false, hasError: true });
    const untouched = await sheet(id);
    expect(untouched.stage).toBe("create-schema-version");
    expect(untouched.generation).toBe(generation + 1);
    expect(untouched.recoveryAttempts ?? 0).toBe(0);
  });

  it("requeues a sheet that no child serves from its stage", async () => {
    const { id } = await setup("detect-schema");
    await ageSheet(id);

    expect(await findingsFor(id)).toEqual([
      expect.objectContaining({ kind: "orphaned", action: "requeue", resumeFrom: "detect-schema" }),
    ]);
    await runIngestRecovery(payload, { apply: true });

    expect((await sheet(id)).generation).toBe(1);
    expect(await findingsFor(id)).toEqual([]);
  });

  it("rolls back the events and the quota of a sheet that died in create-events", async () => {
    const { id, user, datasetId } = await setup("create-events");
    const { payloadJobId, generation } = await queueChild(id, "create-events");
    for (const uniqueId of ["a", "b"]) {
      await payload.create({
        collection: "events",
        data: {
          dataset: datasetId,
          ingestJob: id,
          sourceData: {},
          transformedData: {},
          uniqueId: `${id}-${uniqueId}`,
          eventTimestamp: "2026-01-01T00:00:00.000Z",
        },
        overrideAccess: true,
      });
    }
    await reserveEventQuota(payload, { ingestJobId: id, generation, user, amount: 2 });
    await crash(payloadJobId);

    await runIngestRecovery(payload, { apply: true });

    const [left] = await payload.db.drizzle.select({ value: count() }).from(events).where(eq(events.ingestJob, id));
    expect(Number(left?.value)).toBe(0);
    expect((await createQuotaService(payload).getCurrentUsage(user.id))?.totalEventsCreated ?? 0).toBe(0);
    expect((await sheet(id)).generation).toBe(generation + 1);
  });

  it("keeps the events of a create-events sheet that moved on after it was found", async () => {
    const { id, datasetId } = await setup("create-events");
    const { payloadJobId } = await queueChild(id, "create-events");
    await payload.create({
      collection: "events",
      data: {
        dataset: datasetId,
        ingestJob: id,
        sourceData: {},
        transformedData: {},
        uniqueId: `${id}-kept`,
        eventTimestamp: "2026-01-01T00:00:00.000Z",
      },
      overrideAccess: true,
    });
    await crash(payloadJobId);
    const [finding] = await findingsFor(id);

    // A retry finished the sheet between the report and the apply.
    await payload.db.drizzle.update(ingest_jobs).set({ stage: "completed" }).where(eq(ingest_jobs.id, id));
    const applied = await applyIngestRecovery(payload, finding!);

    expect(applied.outcome).toBe("skipped");
    const [left] = await payload.db.drizzle.select({ value: count() }).from(events).where(eq(events.ingestJob, id));
    expect(Number(left?.value)).toBe(1);
  });

  it("leaves an orphaned sheet alone that changed before the finding is applied", async () => {
    const { id } = await setup("detect-schema");
    await ageSheet(id);
    const [finding] = await findingsFor(id);
    await payload.db.drizzle
      .update(ingest_jobs)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(ingest_jobs.id, id));

    expect((await applyIngestRecovery(payload, finding!)).outcome).toBe("skipped");
    expect((await sheet(id)).generation ?? 0).toBe(0);
  });

  it("reports a sheet whose only unfinished child belongs to an older generation", async () => {
    const { id } = await setup();
    const { generation } = await queueChild(id);
    await payload.db.drizzle
      .update(ingest_jobs)
      .set({ generation: generation + 1, updatedAt: hourAgo() })
      .where(eq(ingest_jobs.id, id));

    expect(await findingsFor(id)).toEqual([expect.objectContaining({ kind: "orphaned", generation: generation + 1 })]);
  });

  it("gives a sheet a fresh recovery budget once it is resumed by other means", async () => {
    const { id } = await setup();
    await crash((await queueChild(id)).payloadJobId);
    await runIngestRecovery(payload, { apply: true });
    expect((await sheet(id)).recoveryAttempts).toBe(1);

    await queueChild(id);
    expect((await sheet(id)).recoveryAttempts).toBe(0);
  });

  it("refuses to delete a sheet whose task holds a live lease", async () => {
    const { id } = await setup();
    const { payloadJobId } = await queueChild(id);
    await crash(payloadJobId, new Date().toISOString());

    await expect(payload.delete({ collection: "ingest-jobs", id, overrideAccess: true })).rejects.toThrow(
      /still running/
    );

    await crash(payloadJobId);
    await payload.delete({ collection: "ingest-jobs", id, overrideAccess: true });
    await expect(sheet(id)).rejects.toThrow();
  });

  it("keeps a worker from claiming a queued child while its sheet is being deleted", async () => {
    const { id } = await setup();
    const { payloadJobId } = await queueChild(id);
    const deletion = await createLocalReq({}, payload);
    await initTransaction(deletion);
    await assertNoLiveIngestTask(payload, [id], deletion);

    try {
      const claim = payload.db.drizzle.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '200ms'`);
        await tx.update(payload_jobs).set({ processing: true }).where(eq(payload_jobs.id, payloadJobId));
      });
      await expect(claim).rejects.toMatchObject({ cause: { code: "55P03" } });
    } finally {
      await commitTransaction(deletion);
    }
  });

  it("waits for a concurrent deletion instead of deadlocking with it", async () => {
    const { id } = await setup();
    const { payloadJobId } = await queueChild(id);
    await crash(payloadJobId);
    const [finding] = await findingsFor(id);

    // A deletion locks the children first, then deletes the sheet.
    const deletion = await createLocalReq({}, payload);
    await initTransaction(deletion);
    await assertNoLiveIngestTask(payload, [id], deletion);
    const applying = applyIngestRecovery(payload, finding!);
    await waitForLockWaiter();
    const db = await getTransactionAwareDrizzle(payload, deletion);
    await db.delete(ingest_jobs).where(eq(ingest_jobs.id, id));
    await commitTransaction(deletion);

    // Skipped by its recheck, not aborted by a deadlock.
    const result = await applying;
    expect(result.outcome).toBe("skipped");
    expect(result.note).toBeUndefined();
  });

  it("touches its Payload job while the workflow runs and stops afterwards", async () => {
    const { id } = await setup();
    const { payloadJobId } = await queueChild(id);
    const old = hourAgo();
    await crash(payloadJobId, old);
    const touchedAt = async () =>
      (
        await payload.db.drizzle
          .select({ updatedAt: payload_jobs.updatedAt })
          .from(payload_jobs)
          .where(eq(payload_jobs.id, payloadJobId))
      )[0]!.updatedAt;

    const workflow = withJobHeartbeat(
      {
        // Stands in for a task that waits, e.g. on a throttled geocoding provider.
        handler: async ({ job }: { job: { id: number }; req: { payload: typeof payload } }) => {
          for (let attempt = 0; attempt < 100 && new Date(await touchedAt()) <= new Date(old); attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          expect(job.id).toBe(payloadJobId);
        },
      },
      25
    );
    await workflow.handler({ job: { id: payloadJobId }, req: { payload } });

    const afterRun = await touchedAt();
    expect(new Date(afterRun).getTime()).toBeGreaterThan(new Date(old).getTime());
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await touchedAt()).toBe(afterRun);
  });
});
