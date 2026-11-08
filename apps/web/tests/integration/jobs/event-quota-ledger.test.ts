// @vitest-environment node
/**
 * Integration tests for the event quota ledger (ADR 0043).
 *
 * A crashed attempt is modelled by skipping its release: the retry of the same
 * generation must find the charge instead of charging again.
 *
 * @module
 */
import { commitTransaction, createLocalReq, initTransaction } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteDatasetJobRows } from "@/lib/account/deletion-uploads";
import { releaseEventQuota, reserveEventQuota, settleEventQuota } from "@/lib/ingest/event-quota-ledger";
import { QuotaExceededError } from "@/lib/services/quota-service";
import { createQuotaService } from "@/lib/services/quota-service";
import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "@/tests/setup/integration/environment";

describe("event quota ledger", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  }, 60000);

  afterAll(async () => {
    await testEnv.cleanup();
  });

  const setup = async (maxTotalEvents = 100) => {
    const key = `ledger${crypto.randomUUID().slice(0, 8)}`;
    const { users } = await withUsers(testEnv, {
      [key]: { role: "editor", customQuotas: { maxTotalEvents, maxEventsPerImport: 1000 } },
      [`${key}b`]: { role: "editor", customQuotas: { maxTotalEvents, maxEventsPerImport: 1000 } },
    });
    const user = users[key]!;
    const { catalog } = await withCatalog(testEnv, { user });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: `Ledger DS ${key}` });
    const { ingestFile } = await withIngestFile(testEnv, catalog.id, "id,name\n1,a\n", {
      status: "processing",
      user: user.id,
    });
    const createJob = async () =>
      (
        await payload.create({
          collection: "ingest-jobs",
          data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: "create-events", sheetIndex: 0 },
          overrideAccess: true,
        })
      ).id;
    const createEvent = async (uniqueId: string, ingestJob?: number) =>
      payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          ingestJob,
          sourceData: {},
          transformedData: {},
          uniqueId,
          eventTimestamp: "2026-01-01T00:00:00.000Z",
        },
        overrideAccess: true,
      });
    return {
      user,
      otherUser: users[`${key}b`]!,
      datasetId: dataset.id,
      ingestJobId: await createJob(),
      createJob,
      createEvent,
    };
  };

  /** Counts the user's rows, including those whose job reference was nulled by a deletion. */
  const rowsOf = async (user: User): Promise<number> =>
    (
      await payload.count({
        collection: "quota-reservations",
        where: { user: { equals: user.id } },
        overrideAccess: true,
      })
    ).totalDocs;

  const usage = async (user: User): Promise<number> =>
    (await createQuotaService(payload).getCurrentUsage(user.id))?.totalEventsCreated ?? 0;

  const rows = async (ingestJobId: number) =>
    (
      await payload.find({
        collection: "quota-reservations",
        where: { ingestJob: { equals: ingestJobId } },
        overrideAccess: true,
      })
    ).docs.map((doc) => ({ generation: doc.generation, amount: doc.amount }));

  it("charges a retried generation once", async () => {
    const { user, ingestJobId } = await setup();

    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 5 });
    // The attempt crashed without releasing; its retry reserves again.
    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 5 });
    expect(await usage(user)).toBe(5);

    await settleEventQuota(payload, { ingestJobId, generation: 1, user, actual: 4 });
    // A crash after settlement retries the same generation.
    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 5 });
    await settleEventQuota(payload, { ingestJobId, generation: 1, user, actual: 4 });

    expect(await usage(user)).toBe(4);
    expect(await rows(ingestJobId)).toEqual([{ generation: 1, amount: 4 }]);
  });

  it("releases older generations when a newer one reserves", async () => {
    const { user, ingestJobId } = await setup();

    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 5 });
    await settleEventQuota(payload, { ingestJobId, generation: 1, user, actual: 5 });
    await reserveEventQuota(payload, { ingestJobId, generation: 2, user, amount: 3 });

    expect(await usage(user)).toBe(3);
    expect(await rows(ingestJobId)).toEqual([{ generation: 2, amount: 3 }]);
  });

  it("records nothing when the reservation exceeds the limit", async () => {
    const { user, ingestJobId } = await setup(10);

    await expect(reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 11 })).rejects.toBeInstanceOf(
      QuotaExceededError
    );

    expect(await usage(user)).toBe(0);
    expect(await rows(ingestJobId)).toEqual([]);
  });

  it("charges committed events beyond the limit on settlement", async () => {
    const { user, ingestJobId } = await setup(10);

    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 8 });
    await settleEventQuota(payload, { ingestJobId, generation: 1, user, actual: 12 });

    expect(await usage(user)).toBe(12);
  });

  it("releases every charge of the job once", async () => {
    const { user, ingestJobId } = await setup();
    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 6 });

    expect(await releaseEventQuota(payload, ingestJobId)).toBe(6);
    expect(await releaseEventQuota(payload, ingestJobId)).toBe(0);
    expect(await usage(user)).toBe(0);
    expect(await rows(ingestJobId)).toEqual([]);
  });

  it("moves the charge to the file's new owner", async () => {
    const { user, otherUser, ingestJobId } = await setup();

    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 5 });
    await settleEventQuota(payload, { ingestJobId, generation: 1, user: otherUser, actual: 4 });

    expect(await usage(user)).toBe(0);
    expect(await usage(otherUser)).toBe(4);
  });

  it("keeps the charge for surviving inserts when the job is deleted", async () => {
    const { user, createJob, createEvent } = await setup();
    const updated = await createEvent(`old-${crypto.randomUUID()}`);
    const ingestJobId = await createJob();
    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 6 });
    // The attempt crashed after inserting two events and updating one in place.
    await createEvent(`new-${crypto.randomUUID()}`, ingestJobId);
    await createEvent(`new-${crypto.randomUUID()}`, ingestJobId);
    await payload.update({
      collection: "events",
      id: updated.id,
      data: { ingestJob: ingestJobId },
      overrideAccess: true,
    });

    await payload.delete({ collection: "ingest-jobs", id: ingestJobId, overrideAccess: true });

    expect(await usage(user)).toBe(2);
    expect(await rowsOf(user)).toBe(0);
  });

  it("keeps a settled charge when the job is deleted, even after its events were", async () => {
    const { user, ingestJobId, createEvent } = await setup();
    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 3 });
    const event = await createEvent(`new-${crypto.randomUUID()}`, ingestJobId);
    await settleEventQuota(payload, { ingestJobId, generation: 1, user, actual: 3 });
    await payload.delete({ collection: "events", id: event.id, overrideAccess: true });

    await payload.delete({ collection: "ingest-jobs", id: ingestJobId, overrideAccess: true });

    expect(await usage(user)).toBe(3);
    expect(await rowsOf(user)).toBe(0);
  });

  it("refunds an unsettled reservation when a dataset deletion removes the job", async () => {
    const { user, ingestJobId, datasetId } = await setup();
    await reserveEventQuota(payload, { ingestJobId, generation: 1, user, amount: 4 });

    const req = await createLocalReq({}, payload);
    await initTransaction(req);
    await deleteDatasetJobRows(payload, datasetId, req);
    await commitTransaction(req);

    expect(await usage(user)).toBe(0);
    expect(await rowsOf(user)).toBe(0);
  });
});
