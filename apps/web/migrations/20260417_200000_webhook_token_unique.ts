/**
 * Add DB-level unique constraints on webhook tokens.
 *
 * Two collections expose webhook triggers gated by a random token:
 *  - `scheduled_ingests.webhook_token`
 *  - `scrapers.webhook_token`
 *
 * Without a unique index, two concurrent inserts could theoretically produce
 * the same token (astronomically unlikely with secure random generation, but
 * not impossible) and authentication would become ambiguous. A DB-level unique
 * constraint gives us an atomic guarantee: any future collision is rejected
 * at write time.
 *
 * Partial index (`WHERE webhook_token IS NOT NULL`) so rows without a token
 * (webhook disabled) do not collide with one another.
 *
 * NOTE: `CREATE INDEX CONCURRENTLY` is not used here because the surrounding
 * migration framework runs each migration inside a transaction, and
 * CONCURRENTLY cannot run inside a transaction block. Every other migration
 * in this codebase uses plain `CREATE INDEX`; matching that convention.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS scheduled_ingests_webhook_token_unique
      ON payload.scheduled_ingests (webhook_token)
      WHERE webhook_token IS NOT NULL;
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS scrapers_webhook_token_unique
      ON payload.scrapers (webhook_token)
      WHERE webhook_token IS NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS payload.scheduled_ingests_webhook_token_unique;
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS payload.scrapers_webhook_token_unique;
  `);
}
