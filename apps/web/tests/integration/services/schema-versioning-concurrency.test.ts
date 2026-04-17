/**
 * Verifies that concurrent `SchemaVersioningService.createSchemaVersion` calls
 * against a single dataset produce distinct, monotonic version numbers —
 * mirroring the real race where multiple workflow sheets map to the same
 * dataset and hit `create-schema-version` in parallel.
 *
 * The advisory lock + unique index + retry together should ensure:
 *   - All N calls succeed.
 *   - Version numbers are {1..N} with no duplicates.
 *
 * @module
 */
import type { PayloadRequest } from "payload";
import { commitTransaction, initTransaction, killTransaction } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SchemaVersioningService } from "@/lib/ingest/schema-versioning";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "../../setup/integration/environment";

/**
 * Run `fn` inside a fresh Payload-managed transaction so the advisory lock in
 * `SchemaVersioningService` scopes correctly (matches the job-handler pattern
 * where each workflow task runs with its own transactionID).
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
const withTransaction = async <T>(payload: any, fn: (req: PayloadRequest) => Promise<T>): Promise<T> => {
  const req = { payload, transactionID: undefined, context: {} } as unknown as PayloadRequest;
  const ownsTransaction = await initTransaction(req);
  try {
    const result = await fn(req);
    if (ownsTransaction) await commitTransaction(req);
    return result;
  } catch (error) {
    if (ownsTransaction) await killTransaction(req);
    throw error;
  }
};

describe.sequential("SchemaVersioningService — concurrent creation", () => {
  const collectionsToReset = ["dataset-schemas"];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  let adminUser: any;
  let catalogId: number;
  let datasetId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, ["admin"]);
    adminUser = users.admin;

    const { catalog } = await withCatalog(testEnv, { name: "Schema Versioning Concurrency Catalog", user: adminUser });
    catalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup != null) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);

    const { dataset } = await withDataset(testEnv, catalogId, {
      name: `Schema Versioning Concurrency Dataset ${crypto.randomUUID().slice(0, 8)}`,
    });
    datasetId = dataset.id;
  });

  it("assigns distinct, monotonic version numbers under parallel creation", async () => {
    const CONCURRENT_CALLS = 5;
    const schema = {
      type: "object",
      properties: { id: { type: "string" }, title: { type: "string" } },
      required: ["id", "title"],
    };

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () =>
        withTransaction(payload, (req) =>
          SchemaVersioningService.createSchemaVersion(payload, { dataset: datasetId, schema, autoApproved: true, req })
        )
      )
    );

    const versions = results.map((r) => r.versionNumber).sort((a, b) => a - b);
    expect(versions).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(versions).size).toBe(CONCURRENT_CALLS);

    const persisted = await payload.find({
      collection: "dataset-schemas",
      where: { dataset: { equals: datasetId } },
      sort: "versionNumber",
      limit: CONCURRENT_CALLS + 1,
    });
    expect(persisted.docs.map((d) => d.versionNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it("enforces DB-level uniqueness if app-level lock is bypassed", async () => {
    await SchemaVersioningService.createSchemaVersion(payload, {
      dataset: datasetId,
      schema: { type: "object" },
      autoApproved: true,
    });

    await expect(
      payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: datasetId,
          versionNumber: 1,
          schema: { type: "object" },
          fieldMetadata: {},
          autoApproved: true,
          _status: "published",
        },
        overrideAccess: true,
      })
    ).rejects.toThrow();
  });
});
