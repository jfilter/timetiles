/**
 * `sort` must mean the same thing on both event-list execution paths.
 *
 * `/api/v1/events` answers from Payload normally and from raw SQL when a field, range or
 * cluster filter is present. Only the SQL path can sort by a `transformedData` path; Payload's
 * `buildOrderBy` resolves the column inside a try/catch and silently drops what it cannot
 * resolve, leaving just the `id` tiebreaker. So `sort=title` used to order by title with a
 * filter attached and by insertion order without one — same URL, two different orderings.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as eventsGet } from "../../../app/api/v1/events/route";
import type { TestEnvironment } from "../../setup/integration/environment";

// Inserted in an order that does not match either the alphabetical or the reverse order, so
// neither can be produced by falling back to the id tiebreaker.
const ROWS = [
  { title: "Charlie", price: "30" },
  { title: "Alpha", price: "10" },
  { title: "Bravo", price: "20" },
];

describe.sequential("event list sorting by a transformedData field", () => {
  let payload: Payload;
  let datasetId: number;
  let testEnv: TestEnvironment;

  const titlesFor = async (queryString: string): Promise<string[]> => {
    const url = `http://localhost:3000/api/v1/events?datasets=${datasetId}&limit=50&${queryString}`;
    const response = await eventsGet(new NextRequest(url), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { events: Array<{ data: { title?: string } }> };
    return data.events.map((event) => event.data.title ?? "");
  };

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    const { catalog } = await withCatalog(testEnv, {
      name: "Sort Parity Catalog",
      isPublic: true,
      user: users.testUser,
    });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: "Sort Parity Dataset", isPublic: true });
    datasetId = dataset.id;

    for (const [index, row] of ROWS.entries()) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `sort-parity-${index + 1}`,
          dataset: datasetId,
          sourceData: row,
          transformedData: row,
          location: { latitude: 40 + index * 0.5, longitude: -74 + index * 0.5 },
          eventTimestamp: new Date(2024, 0, 1 + index).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  it("sorts by a custom field without any filter", async () => {
    expect(await titlesFor("sort=title")).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts descending by a custom field without any filter", async () => {
    expect(await titlesFor("sort=-title")).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("produces the same order with a filter that matches everything", async () => {
    const rf = encodeURIComponent(JSON.stringify({ price: { min: 0 } }));
    expect(await titlesFor(`sort=title&rf=${rf}`)).toEqual(await titlesFor("sort=title"));
  });

  it("still sorts by native columns", async () => {
    expect(await titlesFor("sort=-eventTimestamp")).toEqual(["Bravo", "Alpha", "Charlie"]);
  });
});
