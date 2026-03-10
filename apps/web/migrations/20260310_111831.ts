import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."dataset_schemas" ADD COLUMN "dataset_is_public" boolean DEFAULT false;
  ALTER TABLE "payload"."dataset_schemas" ADD COLUMN "catalog_owner_id" numeric;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD COLUMN "version_dataset_is_public" boolean DEFAULT false;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD COLUMN "version_catalog_owner_id" numeric;
  CREATE INDEX "dataset_schemas_dataset_is_public_idx" ON "payload"."dataset_schemas" USING btree ("dataset_is_public");
  CREATE INDEX "dataset_schemas_catalog_owner_id_idx" ON "payload"."dataset_schemas" USING btree ("catalog_owner_id");
  CREATE INDEX "_dataset_schemas_v_version_version_dataset_is_public_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_dataset_is_public");
  CREATE INDEX "_dataset_schemas_v_version_version_catalog_owner_id_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_catalog_owner_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."dataset_schemas_dataset_is_public_idx";
  DROP INDEX "payload"."dataset_schemas_catalog_owner_id_idx";
  DROP INDEX "payload"."_dataset_schemas_v_version_version_dataset_is_public_idx";
  DROP INDEX "payload"."_dataset_schemas_v_version_version_catalog_owner_id_idx";
  ALTER TABLE "payload"."dataset_schemas" DROP COLUMN "dataset_is_public";
  ALTER TABLE "payload"."dataset_schemas" DROP COLUMN "catalog_owner_id";
  ALTER TABLE "payload"."_dataset_schemas_v" DROP COLUMN "version_dataset_is_public";
  ALTER TABLE "payload"."_dataset_schemas_v" DROP COLUMN "version_catalog_owner_id";`)
}
