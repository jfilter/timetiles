import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."events" ADD COLUMN "coordinate_source_normalized_address" varchar;
  ALTER TABLE "payload"."_events_v" ADD COLUMN "version_coordinate_source_normalized_address" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."events" DROP COLUMN "coordinate_source_normalized_address";
  ALTER TABLE "payload"."_events_v" DROP COLUMN "version_coordinate_source_normalized_address";`)
}
