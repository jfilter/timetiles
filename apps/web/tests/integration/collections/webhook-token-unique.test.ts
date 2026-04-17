// @vitest-environment node
/**
 * Tests the DB-level unique constraint on webhook tokens.
 *
 * Backs the security-critical invariant that no two scheduled imports (or
 * scrapers) can share the same webhook trigger token. Without this
 * constraint a (highly unlikely) collision from concurrent secure-random
 * generation would produce an ambiguous authentication surface.
 *
 * @module
 */

import { sql } from "@payloadcms/db-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Catalog, User } from "@/payload-types";
import { createIntegrationTestEnvironment, withCatalog, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Webhook token DB unique constraint", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let user: User;
  let catalog: Catalog;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { owner: { role: "admin" } });
    user = users.owner;

    const { catalog: cat } = await withCatalog(testEnv, { name: "Webhook Token Catalog", user });
    catalog = cat;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  it("rejects a second scheduled_ingest inserted with the same webhook token", async () => {
    // Use raw SQL inserts for BOTH rows. The webhook lifecycle hook
    // (`handleWebhookTokenLifecycle`) unconditionally rotates the token on
    // create when `webhookEnabled` is true, so we can't pin a specific
    // token value via payload.create and then provoke a collision. The
    // test's contract is the DB-level unique index, so raw SQL is the
    // correct level to assert at anyway.
    const token = `dup-tok-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await payload.db.drizzle.execute(sql`
      INSERT INTO payload.scheduled_ingests
        (name, source_url, enabled, schedule_type, frequency, catalog_id,
         webhook_enabled, webhook_token, created_by_id, updated_at, created_at)
      VALUES
        (${`Webhook Unique A ${Date.now()}`}, 'https://example.com/data.csv', true,
         'frequency', 'daily', ${catalog.id}, true, ${token}, ${user.id},
         NOW(), NOW())
    `);

    await expect(
      payload.db.drizzle.execute(sql`
        INSERT INTO payload.scheduled_ingests
          (name, source_url, enabled, schedule_type, frequency, catalog_id,
           webhook_enabled, webhook_token, created_by_id, updated_at, created_at)
        VALUES
          (${`Webhook Unique B ${Date.now()}`}, 'https://example.com/data.csv', true,
           'frequency', 'daily', ${catalog.id}, true, ${token}, ${user.id},
           NOW(), NOW())
      `)
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it("allows multiple rows with null webhook tokens (partial index)", async () => {
    // Two scheduled ingests with webhook disabled (token left NULL) must both
    // be allowed — the index is partial on WHERE webhook_token IS NOT NULL.
    const a = await payload.create({
      collection: "scheduled-ingests",
      data: {
        name: `No Token A ${Date.now()}-${Math.random()}`,
        sourceUrl: "https://example.com/data.csv",
        enabled: true,
        scheduleType: "frequency",
        frequency: "daily",
        catalog: catalog.id,
        webhookEnabled: false,
        createdBy: user.id,
      },
    });
    const b = await payload.create({
      collection: "scheduled-ingests",
      data: {
        name: `No Token B ${Date.now()}-${Math.random()}`,
        sourceUrl: "https://example.com/data.csv",
        enabled: true,
        scheduleType: "frequency",
        frequency: "daily",
        catalog: catalog.id,
        webhookEnabled: false,
        createdBy: user.id,
      },
    });
    expect(a.webhookToken ?? null).toBeNull();
    expect(b.webhookToken ?? null).toBeNull();
  });
});
