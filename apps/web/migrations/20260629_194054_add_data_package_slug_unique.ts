import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."scheduled_ingests_data_package_slug_idx";
  CREATE UNIQUE INDEX "scheduled_ingests_data_package_slug_idx" ON "payload"."scheduled_ingests" USING btree ("data_package_slug");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."scheduled_ingests_data_package_slug_idx";
  CREATE INDEX "scheduled_ingests_data_package_slug_idx" ON "payload"."scheduled_ingests" USING btree ("data_package_slug");`)
}
