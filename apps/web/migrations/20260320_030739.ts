import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_jobs" ADD COLUMN "config_snapshot" jsonb;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_config_snapshot" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_jobs" DROP COLUMN "config_snapshot";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_config_snapshot";`)
}
