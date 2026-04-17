// @vitest-environment node
/**
 * Integration tests for `bulkInsertEvents`.
 *
 * Verifies two guarantees the import pipeline relies on:
 * 1. Happy path — every inserted event has exactly one matching `_events_v` row
 *    with `latest = true` and `parent` pointing back at the event.
 * 2. Atomicity — if the `_events_v` insert fails mid-batch, the matching
 *    `events` rows roll back (no orphaned events with no version).
 *
 * The atomicity test injects a fault at the Drizzle seam by wrapping the
 * transaction's `insert` to reject `_events_v` inserts, then asserts that
 * the events table is unchanged after the thrown error.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import { inArray } from "@payloadcms/db-postgres/drizzle";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { bulkInsertEvents, type BulkEventData } from "@/lib/jobs/utils/bulk-event-insert";
import { _events_v } from "@/payload-generated-schema";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("bulkInsertEvents — atomicity", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  let testUser: any;
  let testCatalogId: number;
  let testDatasetId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { uploader: { role: "user" } });
    testUser = users.uploader;

    const { catalog } = await withCatalog(testEnv, { user: testUser });
    testCatalogId = catalog.id;

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Bulk Insert Test Dataset ${crypto.randomUUID().slice(0, 8)}`,
    });
    testDatasetId = dataset.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeEvent = (uniqueId: string, index: number): BulkEventData => ({
    dataset: testDatasetId,
    sourceData: { title: `Event ${index}`, id: uniqueId },
    transformedData: { title: `Event ${index}`, id: uniqueId },
    uniqueId,
    eventTimestamp: new Date(2026, 0, 1 + index).toISOString(),
    coordinateSource: { type: "none" },
    validationStatus: "valid",
    datasetIsPublic: false,
  });

  it("inserts matching events and version rows atomically", async () => {
    const prefix = `bulk-happy-${crypto.randomUUID().slice(0, 8)}`;
    const batch = Array.from({ length: 12 }, (_, i) => makeEvent(`${prefix}-${i}`, i));

    const inserted = await bulkInsertEvents(payload, batch);

    expect(inserted).toBe(batch.length);

    const eventRows = (await payload.db.drizzle.execute(sql`
      SELECT id, unique_id
        FROM payload.events
       WHERE unique_id LIKE ${`${prefix}-%`}
    `)) as { rows: Array<{ id: number; unique_id: string }> };
    expect(eventRows.rows).toHaveLength(batch.length);

    const eventIds = eventRows.rows.map((r) => r.id);
    const versionRows = (await payload.db.drizzle
      .select({ parentId: _events_v.parent, latest: _events_v.latest })
      .from(_events_v)
      .where(inArray(_events_v.parent, eventIds))) as Array<{ parentId: number; latest: boolean }>;

    expect(versionRows).toHaveLength(batch.length);
    expect(versionRows.every((r) => r.latest === true)).toBe(true);
    expect(new Set(versionRows.map((r) => r.parentId))).toEqual(new Set(eventIds));
  });

  it("rolls back events insert when _events_v insert fails", async () => {
    const prefix = `bulk-rollback-${crypto.randomUUID().slice(0, 8)}`;
    const batch = Array.from({ length: 3 }, (_, i) => makeEvent(`${prefix}-${i}`, i));

    const originalTransaction = payload.db.drizzle.transaction.bind(payload.db.drizzle);
    vi.spyOn(payload.db.drizzle, "transaction").mockImplementationOnce(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      async (callback: any) =>
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        originalTransaction(async (tx: any) => {
          const originalInsert = tx.insert.bind(tx);
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          tx.insert = (table: any) => {
            if (table === _events_v) {
              throw new Error("simulated _events_v insert failure");
            }
            return originalInsert(table);
          };
          return callback(tx);
        })
    );

    await expect(bulkInsertEvents(payload, batch)).rejects.toThrow(/simulated _events_v insert failure/);

    const remaining = (await payload.db.drizzle.execute(sql`
      SELECT COUNT(*)::int AS count
        FROM payload.events
       WHERE unique_id LIKE ${`${prefix}-%`}
    `)) as { rows: Array<{ count: number }> };
    expect(remaining.rows[0]?.count).toBe(0);
  });
});
