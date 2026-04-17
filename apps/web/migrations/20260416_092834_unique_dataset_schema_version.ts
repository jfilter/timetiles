/**
 * Add UNIQUE constraint on (dataset_id, version_number) in payload.dataset_schemas.
 *
 * Prevents duplicate schema versions for the same dataset when
 * multiple workflow tasks run `create-schema-version` concurrently (e.g. two
 * sheets mapped to the same dataset via `sheetMappings`, or sheets with
 * duplicate names falling through `findOrCreateDataset`).
 *
 * Complements the app-level `pg_advisory_xact_lock` in SchemaVersioningService.
 * If the lock is ever bypassed, the DB refuses duplicate versions.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS dataset_schemas_dataset_version_unique
      ON payload.dataset_schemas (dataset_id, version_number)
      WHERE dataset_id IS NOT NULL AND version_number IS NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS payload.dataset_schemas_dataset_version_unique;
  `);
}
