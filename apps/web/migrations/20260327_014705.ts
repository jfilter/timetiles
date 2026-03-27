import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_datasets_ingest_transforms_type" ADD VALUE 'extract';
  ALTER TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" ADD VALUE 'extract';
  ALTER TABLE "payload"."datasets_ingest_transforms" ADD COLUMN "group" numeric;
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ADD COLUMN "group" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum_datasets_ingest_transforms_type";
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split', 'parse-json-array');
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum_datasets_ingest_transforms_type";
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum_datasets_ingest_transforms_type" USING "type"::"payload"."enum_datasets_ingest_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_type";
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split', 'parse-json-array');
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum__datasets_v_version_ingest_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" USING "type"::"payload"."enum__datasets_v_version_ingest_transforms_type";
  ALTER TABLE "payload"."datasets_ingest_transforms" DROP COLUMN "group";
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" DROP COLUMN "group";`)
}
