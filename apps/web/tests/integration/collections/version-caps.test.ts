/**
 * Integration tests for the version caps on machine-written collections.
 *
 * Re-imports update the same event again and again; the cap keeps its history bounded
 * and never drops the `latest` version.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EVENT_VERSIONS_PER_DOC } from "@/lib/collections/shared-fields";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Version caps", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let datasetId: number;

  const createEvent = async (uniqueId: string) =>
    payload.create({
      collection: "events",
      data: {
        uniqueId,
        dataset: datasetId,
        sourceData: {},
        transformedData: {},
        eventTimestamp: new Date(2024, 0, 1).toISOString(),
        _status: "published",
      },
    });

  const versionRows = async (parentId: number) => {
    const result = await payload.db.drizzle.execute(
      sql`SELECT id, latest FROM "payload"."_events_v" WHERE parent_id = ${parentId} ORDER BY id`
    );
    return result.rows as Array<{ id: number; latest: boolean | null }>;
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    const { users } = await withUsers(testEnv, { owner: { role: "user" } });
    const { catalog } = await withCatalog(testEnv, { isPublic: true, user: users.owner });
    const { dataset } = await withDataset(testEnv, catalog.id, { isPublic: true });
    datasetId = dataset.id;
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("keeps at most the capped number of versions per event", async () => {
    const event = await createEvent(`cap-${crypto.randomUUID()}`);
    for (let i = 0; i < EVENT_VERSIONS_PER_DOC + 5; i++) {
      await payload.update({ collection: "events", id: event.id, data: { locationName: `Run ${i}` } });
    }

    const rows = await versionRows(event.id);
    expect(rows.length).toBeLessThanOrEqual(EVENT_VERSIONS_PER_DOC);
    expect(rows.some((row) => row.latest === true)).toBe(true);
  });
});
