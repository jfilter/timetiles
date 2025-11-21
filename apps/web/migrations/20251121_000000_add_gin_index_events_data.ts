import type { MigrateUpArgs, MigrateDownArgs} from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres'

/**
 * Migration to add GIN index on events.data JSONB field.
 *
 * This index enables fast queries on any field within the JSON data,
 * eliminating the need for normalized title/description columns.
 *
 * GIN (Generalized Inverted Index) is optimized for JSONB columns and supports:
 * - Containment queries (@>, @?, @@)
 * - Existence queries (?|, ?&)
 * - Path queries (#>, #>>)
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX IF NOT EXISTS "events_data_gin_idx" ON "payload"."events" USING GIN ("data");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload"."events_data_gin_idx";`)
}
