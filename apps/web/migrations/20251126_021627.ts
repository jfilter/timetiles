import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_features" ALTER COLUMN "columns" SET DEFAULT '3';
  ALTER TABLE "payload"."_pages_v_blocks_features" ALTER COLUMN "columns" SET DEFAULT '3';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_features" ALTER COLUMN "columns" SET DEFAULT 3;
  ALTER TABLE "payload"."_pages_v_blocks_features" ALTER COLUMN "columns" SET DEFAULT 3;`)
}
