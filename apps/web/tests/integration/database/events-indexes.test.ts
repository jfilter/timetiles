/**
 * Index set on `payload.events` after all migrations.
 *
 * @module
 * @category Integration Tests
 */
import { sql } from "@payloadcms/db-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment } from "@/tests/setup/integration/environment";

describe("payload.events indexes", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("has exactly one GIN index on transformed_data", async () => {
    const result = (await testEnv.payload.db.drizzle.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'payload' AND tablename = 'events' AND indexdef ILIKE '%USING gin (transformed_data)%'
    `)) as { rows: Array<{ indexname: string }> };

    expect(result.rows.map((r) => r.indexname)).toEqual(["events_transformed_data_gin_idx"]);
  });
});
