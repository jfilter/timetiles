/**
 * Integration tests for the sources stats API route.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/api/v1/sources/stats/route";
import type { DataSourceStatsResponse } from "@/lib/types/data-source-stats";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("/api/v1/sources/stats", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let orphanDatasetId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    const { users } = await withUsers(testEnv, { owner: { role: "user" } });
    const { catalog } = await withCatalog(testEnv, { isPublic: true, user: users.owner });
    const { dataset } = await withDataset(testEnv, catalog.id, { isPublic: true });
    orphanDatasetId = dataset.id;

    for (const uniqueId of ["orphan-1", "orphan-2"]) {
      await testEnv.payload.create({
        collection: "events",
        data: { _status: "published", uniqueId, dataset: dataset.id, sourceData: {}, transformedData: {} },
      });
    }
    await testEnv.payload.delete({ collection: "catalogs", id: catalog.id, overrideAccess: true });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("counts events of a public dataset whose catalog was deleted in the total", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/sources/stats"), {
      params: Promise.resolve({}),
    });
    const body = (await response.json()) as DataSourceStatsResponse;

    expect(response.status).toBe(200);
    expect(body.datasetCounts[String(orphanDatasetId)]).toBe(2);
    expect(body.totalEvents).toBe(Object.values(body.datasetCounts).reduce((sum, count) => sum + count, 0));
  });
});
