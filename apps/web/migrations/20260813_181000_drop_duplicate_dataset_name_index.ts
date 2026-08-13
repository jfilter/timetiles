/**
 * Drop the duplicate unique index on `datasets(catalog_id, name)`.
 *
 * `20260321_233541` created `datasets_catalog_name_unique_idx` and `20260417_100000` created
 * `datasets_catalog_name_unique` with a byte-identical definition, so every dataset write
 * maintained the same partial unique index twice. The name kept is the one the code refers to
 * (`DATASET_CATALOG_NAME_UNIQUE_INDEX`, and `isUniqueViolation(error, "datasets_catalog_name_unique")`),
 * so the constraint name in a 23505 message stays recognizable.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS payload."datasets_catalog_name_unique_idx"`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "datasets_catalog_name_unique_idx"
        ON payload."datasets" USING btree ("catalog_id", "name")
        WHERE "deleted_at" IS NULL`
  );
}
