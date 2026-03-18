import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "timezone" varchar DEFAULT 'UTC';
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_timezone" varchar DEFAULT 'UTC';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "timezone";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_timezone";`)
}
