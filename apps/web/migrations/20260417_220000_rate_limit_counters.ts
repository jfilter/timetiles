/**
 * Add PostgreSQL-backed rate-limit counter storage.
 *
 * The table is UNLOGGED because rate-limit counters are ephemeral and do not
 * need WAL durability. Horizontal deployments can use this shared store by
 * setting `RATE_LIMIT_BACKEND=pg`.
 *
 * @module
 * @category Migrations
 */

import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE UNLOGGED TABLE IF NOT EXISTS payload.rate_limit_counters (
      "key" text PRIMARY KEY,
      count integer NOT NULL,
      blocked boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
  `);

  await db.execute(sql`
    ALTER TABLE IF EXISTS payload.rate_limit_counters SET UNLOGGED;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rate_limit_counters_expires_at_idx
      ON payload.rate_limit_counters (expires_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS payload.rate_limit_counters;
  `);
}
