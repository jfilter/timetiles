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
import type { CollectionBeforeChangeHook, PayloadRequest } from "payload";
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

  it.each([true, false])(
    "assigns distinct versions under parallel creation (caller transaction: %s)",
    async (transactional) => {
      const CONCURRENT_CALLS = 5;
      const schema = {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" } },
        required: ["id", "title"],
      };

      const results = await Promise.all(
        Array.from({ length: CONCURRENT_CALLS }, () => {
          const create = (req?: PayloadRequest) =>
            SchemaVersioningService.createSchemaVersion(payload, {
              dataset: datasetId,
              schema,
              autoApproved: true,
              req,
            });
          return transactional ? withTransaction(payload, create) : create();
        })
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
    }
  );

  it("does not retry outside a caller transaction after a unique violation rolls it back", async () => {
    await SchemaVersioningService.createSchemaVersion(payload, { dataset: datasetId, schema: { type: "object" } });
    const originalCatalog = await payload.findByID({ collection: "catalogs", id: catalogId });
    const hooks = payload.collections["dataset-schemas"].config.hooks;
    const originalHooks = hooks.beforeChange;
    let attempts = 0;
    const forceFirstCollision: CollectionBeforeChangeHook = ({ data }) => {
      // Exercise the real unique index after the service has selected a free version.
      if (++attempts === 1) data.versionNumber = 1;
      return data;
    };
    hooks.beforeChange = [...(originalHooks ?? []), forceFirstCollision];
    try {
      await expect(
        withTransaction(payload, async (req) => {
          await payload.update({
            collection: "catalogs",
            id: catalogId,
            data: { name: "Uncommitted catalog rename" },
            req,
          });
          return SchemaVersioningService.createSchemaVersion(payload, {
            dataset: datasetId,
            schema: { type: "object" },
            req,
          });
        })
      ).rejects.toThrow();
      expect(attempts).toBe(1);
      const schemas = await payload.find({ collection: "dataset-schemas", where: { dataset: { equals: datasetId } } });
      expect(schemas.docs.map((schema) => schema.versionNumber)).toEqual([1]);
      expect((await payload.findByID({ collection: "catalogs", id: catalogId })).name).toBe(originalCatalog.name);
    } finally {
      hooks.beforeChange = originalHooks;
    }
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
