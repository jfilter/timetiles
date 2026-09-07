/**
 * Dataset counts must match Payload's normal, trash-excluding event reads.
 *
 * @module
 * @category Tests
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fetchDatasetEventCounts } from "@/lib/database/filtered-events-query";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("fetchDatasetEventCounts", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  it("excludes trashed events and keeps active events", async () => {
    const { users } = await withUsers(env, { owner: { role: "user" } });
    const { catalog } = await withCatalog(env, { user: users.owner });
    const { dataset } = await withDataset(env, catalog.id);
    const ids: number[] = [];
    for (let index = 0; index < 2; index++) {
      const event = await env.payload.create({
        collection: "events",
        data: { uniqueId: randomUUID(), dataset: dataset.id, sourceData: {}, transformedData: {} },
      });
      ids.push(event.id);
    }
    expect((await fetchDatasetEventCounts(env.payload, [dataset.id])).get(dataset.id)).toBe(2);

    await env.payload.update({ collection: "events", id: ids[0]!, data: { deletedAt: new Date().toISOString() } });
    const deleted = await env.payload.findByID({ collection: "events", id: ids[0]!, trash: true });
    expect(deleted.deletedAt).toBeTruthy();
    expect((await fetchDatasetEventCounts(env.payload, [dataset.id])).get(dataset.id)).toBe(1);
    expect(await fetchDatasetEventCounts(env.payload, [])).toEqual(new Map());
  });
});
