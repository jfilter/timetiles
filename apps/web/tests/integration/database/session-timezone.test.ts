/**
 * The database session must run in UTC, and historical timestamps must survive a round trip.
 *
 * Payload's postgres adapter maps timestamp columns in `mode: "string"`, so a date reaches
 * Payload as the text Postgres rendered, and it then does `new Date(text).toISOString()`.
 * Under a non-UTC session zone a timestamp before that zone's first standard offset (pre-1900
 * almost everywhere — LMT) renders with a seconds-precision offset like `+00:53:28`, which
 * JavaScript's date parser rejects: the read throws `RangeError: Invalid time value` and takes
 * the whole request with it. A 19th-century event could not be stored at all.
 *
 * @module
 * @category Integration Tests
 */
import { randomUUID } from "node:crypto";

import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TestEnvironment } from "../../setup/integration/environment";

/** Integration projects run with `retry: 2`; a fixed uniqueId makes the retry fail on a
 *  duplicate key instead of the assertion that actually broke. */
const RUN_ID = randomUUID().slice(0, 8);

describe.sequential("database session time zone", () => {
  let payload: Payload;
  let datasetId: number;
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { owner: { role: "user" } });
    const { catalog } = await withCatalog(testEnv, { name: "Historic Catalog", isPublic: true, user: users.owner });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: "Historic Dataset", isPublic: true });
    datasetId = dataset.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  it("runs every pooled connection in UTC", async () => {
    const result = (await payload.db.drizzle.execute("SHOW TimeZone")) as { rows: Array<{ TimeZone: string }> };

    expect(result.rows[0]?.TimeZone).toBe("UTC");
  });

  it("renders a pre-1900 timestamp with an offset JavaScript can parse", async () => {
    const result = (await payload.db.drizzle.execute(
      "SELECT (timestamptz '1830-01-01T00:00:00Z')::text AS rendered"
    )) as { rows: Array<{ rendered: string }> };

    const rendered = result.rows[0]!.rendered;
    expect(rendered).toContain("+00");
    // The failure mode: a seconds-precision offset (`+00:53:28`) is not parseable in JS.
    expect(Number.isNaN(new Date(rendered).getTime())).toBe(false);
  });

  it.each([
    { label: "19th century", timestamp: "1830-06-15T12:00:00.000Z" },
    { label: "pre-1900 boundary", timestamp: "1899-12-31T23:59:59.000Z" },
    { label: "modern", timestamp: "2024-06-15T12:00:00.000Z" },
  ])("stores and reads back a $label event timestamp", async ({ label, timestamp }) => {
    const created = await payload.create({
      collection: "events",
      data: {
        uniqueId: `historic-${label.replace(/\s+/g, "-")}-${RUN_ID}`,
        dataset: datasetId,
        sourceData: { title: label },
        transformedData: { title: label },
        eventTimestamp: timestamp,
      },
      overrideAccess: true,
    });

    expect(created.eventTimestamp).toBe(timestamp);

    const reread = await payload.findByID({ collection: "events", id: created.id, overrideAccess: true });
    expect(reread.eventTimestamp).toBe(timestamp);
  });
});
