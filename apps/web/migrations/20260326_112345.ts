import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" DROP COLUMN "schema_config_enabled";
  ALTER TABLE "payload"."datasets" DROP COLUMN "schema_config_strict_validation";
  ALTER TABLE "payload"."datasets" DROP COLUMN "schema_config_allow_transformations";
  ALTER TABLE "payload"."datasets" DROP COLUMN "deduplication_config_strategy";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_schema_config_enabled";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_schema_config_strict_validation";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_schema_config_allow_transformations";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_deduplication_config_strategy";
  DROP TYPE "payload"."enum_datasets_deduplication_config_strategy";
  DROP TYPE "payload"."enum__datasets_v_version_deduplication_config_strategy";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_datasets_deduplication_config_strategy" AS ENUM('skip', 'update', 'version');
  CREATE TYPE "payload"."enum__datasets_v_version_deduplication_config_strategy" AS ENUM('skip', 'update', 'version');
  ALTER TABLE "payload"."datasets" ADD COLUMN "schema_config_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."datasets" ADD COLUMN "schema_config_strict_validation" boolean DEFAULT false;
  ALTER TABLE "payload"."datasets" ADD COLUMN "schema_config_allow_transformations" boolean DEFAULT true;
  ALTER TABLE "payload"."datasets" ADD COLUMN "deduplication_config_strategy" "payload"."enum_datasets_deduplication_config_strategy" DEFAULT 'skip';
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_schema_config_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_schema_config_strict_validation" boolean DEFAULT false;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_schema_config_allow_transformations" boolean DEFAULT true;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_deduplication_config_strategy" "payload"."enum__datasets_v_version_deduplication_config_strategy" DEFAULT 'skip';`)
}
