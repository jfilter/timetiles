import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_datasets_import_transforms_from_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object', 'null');
  CREATE TYPE "payload"."enum_datasets_import_transforms_to_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object');
  CREATE TYPE "payload"."enum_datasets_import_transforms_strategy" AS ENUM('parse', 'cast', 'custom', 'reject');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_from_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object', 'null');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_to_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_strategy" AS ENUM('parse', 'cast', 'custom', 'reject');
  ALTER TYPE "payload"."enum_datasets_import_transforms_type" ADD VALUE 'type-cast';
  ALTER TYPE "payload"."enum__datasets_v_version_import_transforms_type" ADD VALUE 'type-cast';
  DROP TABLE "payload"."transforms" CASCADE;
  DROP TABLE "payload"."_transforms_v" CASCADE;
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "from_type" "payload"."enum_datasets_import_transforms_from_type";
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "to_type" "payload"."enum_datasets_import_transforms_to_type";
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "strategy" "payload"."enum_datasets_import_transforms_strategy" DEFAULT 'parse';
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "custom_function" varchar;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "from_type" "payload"."enum__datasets_v_version_import_transforms_from_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "to_type" "payload"."enum__datasets_v_version_import_transforms_to_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "strategy" "payload"."enum__datasets_v_version_import_transforms_strategy" DEFAULT 'parse';
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "custom_function" varchar;
  DROP TYPE "payload"."enum_transforms_from_type";
  DROP TYPE "payload"."enum_transforms_to_type";
  DROP TYPE "payload"."strategy";
  DROP TYPE "payload"."enum__transforms_v_from_type";
  DROP TYPE "payload"."enum__transforms_v_to_type";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_transforms_from_type" AS ENUM('string', 'number', 'boolean', 'null', 'array', 'object');
  CREATE TYPE "payload"."enum_transforms_to_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object');
  CREATE TYPE "payload"."strategy" AS ENUM('parse', 'cast', 'custom', 'reject');
  CREATE TYPE "payload"."enum__transforms_v_from_type" AS ENUM('string', 'number', 'boolean', 'null', 'array', 'object');
  CREATE TYPE "payload"."enum__transforms_v_to_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object');
  CREATE TABLE "payload"."transforms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"from_type" "payload"."enum_transforms_from_type",
  	"to_type" "payload"."enum_transforms_to_type",
  	"transform_strategy" "payload"."strategy" DEFAULT 'parse',
  	"custom_transform" varchar,
  	"enabled" boolean DEFAULT true
  );
  
  CREATE TABLE "payload"."_transforms_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"from_type" "payload"."enum__transforms_v_from_type",
  	"to_type" "payload"."enum__transforms_v_to_type",
  	"transform_strategy" "payload"."strategy" DEFAULT 'parse',
  	"custom_transform" varchar,
  	"enabled" boolean DEFAULT true,
  	"_uuid" varchar
  );
  
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
  ALTER TABLE "payload"."transforms" ADD CONSTRAINT "transforms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_transforms_v" ADD CONSTRAINT "_transforms_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "transforms_order_idx" ON "payload"."transforms" USING btree ("_order");
  CREATE INDEX "transforms_parent_id_idx" ON "payload"."transforms" USING btree ("_parent_id");
  CREATE INDEX "_transforms_v_order_idx" ON "payload"."_transforms_v" USING btree ("_order");
  CREATE INDEX "_transforms_v_parent_id_idx" ON "payload"."_transforms_v" USING btree ("_parent_id");
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
