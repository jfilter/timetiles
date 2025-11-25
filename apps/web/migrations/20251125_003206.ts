import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_files" ALTER COLUMN "user_id" SET NOT NULL;
  ALTER TABLE "payload"."_import_files_v" ALTER COLUMN "version_user_id" SET NOT NULL;
  ALTER TABLE "payload"."import_files" DROP COLUMN "session_id";
  ALTER TABLE "payload"."_import_files_v" DROP COLUMN "version_session_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_files" ALTER COLUMN "user_id" DROP NOT NULL;
  ALTER TABLE "payload"."_import_files_v" ALTER COLUMN "version_user_id" DROP NOT NULL;
  ALTER TABLE "payload"."import_files" ADD COLUMN "session_id" varchar;
  ALTER TABLE "payload"."_import_files_v" ADD COLUMN "version_session_id" varchar;`)
}
