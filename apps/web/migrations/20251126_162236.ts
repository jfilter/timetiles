import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."catalogs" ADD COLUMN "language" varchar DEFAULT 'eng';
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_language" varchar DEFAULT 'eng';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."catalogs" DROP COLUMN "language";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_language";`)
}
