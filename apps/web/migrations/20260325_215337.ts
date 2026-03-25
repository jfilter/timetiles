import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Split into idempotent steps so partial re-runs don't fail

  // 1. Create tables (IF NOT EXISTS for idempotency)
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "payload"."datasets_id_strategy_exclude_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field_path" varchar
  );
  CREATE TABLE IF NOT EXISTS "payload"."_datasets_v_version_id_strategy_exclude_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"_uuid" varchar
  );`)

  // 2. Migrate enum: datasets.id_strategy_type
  // Convert to text, drop old enum, create new enum, convert back
  await db.execute(sql`
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'enum_datasets_id_strategy_type' AND n.nspname = 'payload') THEN
      ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DATA TYPE text;
      ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DEFAULT 'content-hash'::text;
      DROP TYPE "payload"."enum_datasets_id_strategy_type";
      CREATE TYPE "payload"."enum_datasets_id_strategy_type" AS ENUM('external', 'content-hash', 'auto-generate');
      ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DEFAULT 'content-hash'::"payload"."enum_datasets_id_strategy_type";
      ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DATA TYPE "payload"."enum_datasets_id_strategy_type" USING "id_strategy_type"::"payload"."enum_datasets_id_strategy_type";
    END IF;
  END $$;`)

  // 3. Migrate enum: _datasets_v.version_id_strategy_type
  await db.execute(sql`
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'enum__datasets_v_version_id_strategy_type' AND n.nspname = 'payload') THEN
      ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DATA TYPE text;
      ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DEFAULT 'content-hash'::text;
      DROP TYPE "payload"."enum__datasets_v_version_id_strategy_type";
      CREATE TYPE "payload"."enum__datasets_v_version_id_strategy_type" AS ENUM('external', 'content-hash', 'auto-generate');
      ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DEFAULT 'content-hash'::"payload"."enum__datasets_v_version_id_strategy_type";
      ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DATA TYPE "payload"."enum__datasets_v_version_id_strategy_type" USING "version_id_strategy_type"::"payload"."enum__datasets_v_version_id_strategy_type";
    END IF;
  END $$;`)

  // 4. Add new columns
  await db.execute(sql`
  ALTER TABLE "payload"."datasets" ADD COLUMN IF NOT EXISTS "has_temporal_data" boolean DEFAULT true;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN IF NOT EXISTS "version_has_temporal_data" boolean DEFAULT true;`)

  // 5. Add constraints and indexes (IF NOT EXISTS)
  await db.execute(sql`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'datasets_id_strategy_exclude_fields_parent_id_fk') THEN
      ALTER TABLE "payload"."datasets_id_strategy_exclude_fields" ADD CONSTRAINT "datasets_id_strategy_exclude_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_datasets_v_version_id_strategy_exclude_fields_parent_id_fk') THEN
      ALTER TABLE "payload"."_datasets_v_version_id_strategy_exclude_fields" ADD CONSTRAINT "_datasets_v_version_id_strategy_exclude_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS "datasets_id_strategy_exclude_fields_order_idx" ON "payload"."datasets_id_strategy_exclude_fields" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "datasets_id_strategy_exclude_fields_parent_id_idx" ON "payload"."datasets_id_strategy_exclude_fields" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_datasets_v_version_id_strategy_exclude_fields_order_idx" ON "payload"."_datasets_v_version_id_strategy_exclude_fields" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_datasets_v_version_id_strategy_exclude_fields_parent_id_idx" ON "payload"."_datasets_v_version_id_strategy_exclude_fields" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets_id_strategy_exclude_fields" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_datasets_v_version_id_strategy_exclude_fields" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."datasets_id_strategy_exclude_fields" CASCADE;
  DROP TABLE "payload"."_datasets_v_version_id_strategy_exclude_fields" CASCADE;
  ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DATA TYPE text;
  ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DEFAULT 'auto'::text;
  DROP TYPE "payload"."enum_datasets_id_strategy_type";
  CREATE TYPE "payload"."enum_datasets_id_strategy_type" AS ENUM('external', 'computed', 'auto', 'hybrid');
  ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DEFAULT 'auto'::"payload"."enum_datasets_id_strategy_type";
  ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DATA TYPE "payload"."enum_datasets_id_strategy_type" USING "id_strategy_type"::"payload"."enum_datasets_id_strategy_type";
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DATA TYPE text;
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DEFAULT 'auto'::text;
  DROP TYPE "payload"."enum__datasets_v_version_id_strategy_type";
  CREATE TYPE "payload"."enum__datasets_v_version_id_strategy_type" AS ENUM('external', 'computed', 'auto', 'hybrid');
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DEFAULT 'auto'::"payload"."enum__datasets_v_version_id_strategy_type";
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DATA TYPE "payload"."enum__datasets_v_version_id_strategy_type" USING "version_id_strategy_type"::"payload"."enum__datasets_v_version_id_strategy_type";
  ALTER TABLE "payload"."datasets" DROP COLUMN "has_temporal_data";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_has_temporal_data";`)
}
