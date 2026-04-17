/**
 * Add a DB-level unique constraint on (catalog_id, name) for datasets.
 *
 * Backs up the `validateDatasetNameUniqueness` beforeChange hook with a true
 * atomic guarantee. Without this index, the hook is vulnerable to a TOCTOU
 * race: two concurrent create calls can both pass the `find()` check and
 * then both succeed, producing duplicate (catalog, name) pairs.
 *
 * Partial index (`WHERE deleted_at IS NULL`) so soft-deleted datasets don't
 * block reuse of a (catalog, name) pair — matches the semantics of the hook,
 * which filters through Payload's default trash handling.
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
    CREATE UNIQUE INDEX IF NOT EXISTS datasets_catalog_name_unique
      ON payload.datasets (catalog_id, name)
      WHERE deleted_at IS NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS payload.datasets_catalog_name_unique;
  `);
}
