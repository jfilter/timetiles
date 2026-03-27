import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "pre_processing_group_by" varchar;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "pre_processing_merge_fields" jsonb;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_pre_processing_group_by" varchar;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_pre_processing_merge_fields" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "pre_processing_group_by";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "pre_processing_merge_fields";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_pre_processing_group_by";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_pre_processing_merge_fields";`)
}
