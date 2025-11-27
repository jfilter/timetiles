import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "location_longitude_idx" ON "payload"."events" USING btree ("location_longitude");
  CREATE INDEX "location_latitude_idx" ON "payload"."events" USING btree ("location_latitude");
  CREATE INDEX "version_location_longitude_idx" ON "payload"."_events_v" USING btree ("version_location_longitude");
  CREATE INDEX "version_location_latitude_idx" ON "payload"."_events_v" USING btree ("version_location_latitude");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."location_longitude_idx";
  DROP INDEX "payload"."location_latitude_idx";
  DROP INDEX "payload"."version_location_longitude_idx";
  DROP INDEX "payload"."version_location_latitude_idx";`)
}
