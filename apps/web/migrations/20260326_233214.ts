import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" ADD COLUMN "field_types" jsonb;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_types" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" DROP COLUMN "field_types";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_types";`)
}
