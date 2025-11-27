import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" ADD COLUMN "created_by_id" integer;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_created_by_id" integer;
  ALTER TABLE "payload"."datasets" ADD CONSTRAINT "datasets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v" ADD CONSTRAINT "_datasets_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "datasets_created_by_idx" ON "payload"."datasets" USING btree ("created_by_id");
  CREATE INDEX "_datasets_v_version_version_created_by_idx" ON "payload"."_datasets_v" USING btree ("version_created_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" DROP CONSTRAINT "datasets_created_by_id_users_id_fk";
  
  ALTER TABLE "payload"."_datasets_v" DROP CONSTRAINT "_datasets_v_version_created_by_id_users_id_fk";
  
  DROP INDEX "payload"."datasets_created_by_idx";
  DROP INDEX "payload"."_datasets_v_version_version_created_by_idx";
  ALTER TABLE "payload"."datasets" DROP COLUMN "created_by_id";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_created_by_id";`)
}
