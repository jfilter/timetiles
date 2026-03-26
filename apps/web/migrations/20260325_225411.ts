import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "data_package_slug" varchar;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_data_package_slug" varchar;
  CREATE INDEX "scheduled_ingests_data_package_slug_idx" ON "payload"."scheduled_ingests" USING btree ("data_package_slug");
  CREATE INDEX "_scheduled_ingests_v_version_version_data_package_slug_idx" ON "payload"."_scheduled_ingests_v" USING btree ("version_data_package_slug");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."scheduled_ingests_data_package_slug_idx";
  DROP INDEX "payload"."_scheduled_ingests_v_version_version_data_package_slug_idx";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "data_package_slug";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_data_package_slug";`)
}
