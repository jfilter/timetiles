import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_datasets_import_transforms_operation" ADD VALUE 'expression';
  ALTER TYPE "payload"."enum__datasets_v_version_import_transforms_operation" ADD VALUE 'expression';
  ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum_datasets_import_transforms_type";
  CREATE TYPE "payload"."enum_datasets_import_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split');
  ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum_datasets_import_transforms_type";
  ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum_datasets_import_transforms_type" USING "type"::"payload"."enum_datasets_import_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_type";
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split');
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum__datasets_v_version_import_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum__datasets_v_version_import_transforms_type" USING "type"::"payload"."enum__datasets_v_version_import_transforms_type";
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "expression" varchar;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "expression" varchar;
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "from_type";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "to_type";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "strategy";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "custom_function";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "from_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "to_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "strategy";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "custom_function";
  DROP TYPE "payload"."enum_datasets_import_transforms_from_type";
  DROP TYPE "payload"."enum_datasets_import_transforms_to_type";
  DROP TYPE "payload"."enum_datasets_import_transforms_strategy";
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_from_type";
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_to_type";
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_strategy";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_datasets_import_transforms_from_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object', 'null');
  CREATE TYPE "payload"."enum_datasets_import_transforms_to_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object');
  CREATE TYPE "payload"."enum_datasets_import_transforms_strategy" AS ENUM('parse', 'cast', 'custom', 'reject');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_from_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object', 'null');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_to_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_strategy" AS ENUM('parse', 'cast', 'custom', 'reject');
  ALTER TYPE "payload"."enum_datasets_import_transforms_type" ADD VALUE 'type-cast';
  ALTER TYPE "payload"."enum__datasets_v_version_import_transforms_type" ADD VALUE 'type-cast';
  ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "operation" SET DATA TYPE text;
  DROP TYPE "payload"."enum_datasets_import_transforms_operation";
  CREATE TYPE "payload"."enum_datasets_import_transforms_operation" AS ENUM('uppercase', 'lowercase', 'trim', 'replace');
  ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "operation" SET DATA TYPE "payload"."enum_datasets_import_transforms_operation" USING "operation"::"payload"."enum_datasets_import_transforms_operation";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "operation" SET DATA TYPE text;
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_operation";
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_operation" AS ENUM('uppercase', 'lowercase', 'trim', 'replace');
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "operation" SET DATA TYPE "payload"."enum__datasets_v_version_import_transforms_operation" USING "operation"::"payload"."enum__datasets_v_version_import_transforms_operation";
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "from_type" "payload"."enum_datasets_import_transforms_from_type";
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "to_type" "payload"."enum_datasets_import_transforms_to_type";
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "strategy" "payload"."enum_datasets_import_transforms_strategy" DEFAULT 'parse';
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "custom_function" varchar;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "from_type" "payload"."enum__datasets_v_version_import_transforms_from_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "to_type" "payload"."enum__datasets_v_version_import_transforms_to_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "strategy" "payload"."enum__datasets_v_version_import_transforms_strategy" DEFAULT 'parse';
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "custom_function" varchar;
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "expression";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "expression";`)
}
