/**
 * Drop `events_original_data_gin_idx`, a second GIN index on `transformed_data`.
 *
 * 20260325_014025 meant to replace it with `events_transformed_data_gin_idx`, but dropped it
 * without the `payload` schema, so the index survived the column rename under its old name.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "payload"."events_original_data_gin_idx"`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "events_original_data_gin_idx" ON "payload"."events" USING GIN ("transformed_data")`
  );
}
