import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."events" RENAME COLUMN "original_data" TO "transformed_data";
  ALTER TABLE "payload"."_events_v" RENAME COLUMN "version_original_data" TO "version_transformed_data";
  ALTER TABLE "payload"."events" ADD COLUMN "source_data" jsonb;
  ALTER TABLE "payload"."_events_v" ADD COLUMN "version_source_data" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."events" RENAME COLUMN "transformed_data" TO "original_data";
  ALTER TABLE "payload"."_events_v" RENAME COLUMN "version_transformed_data" TO "version_original_data";
  ALTER TABLE "payload"."events" DROP COLUMN "source_data";
  ALTER TABLE "payload"."_events_v" DROP COLUMN "version_source_data";`)
}
