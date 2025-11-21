import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_datasets_import_transforms_type" AS ENUM('rename');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_type" AS ENUM('rename');
  CREATE TABLE "payload"."datasets_import_transforms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "payload"."enum_datasets_import_transforms_type" DEFAULT 'rename',
  	"from" varchar,
  	"to" varchar,
  	"active" boolean DEFAULT true,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer,
  	"confidence" numeric,
  	"auto_detected" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."_datasets_v_version_import_transforms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"type" "payload"."enum__datasets_v_version_import_transforms_type" DEFAULT 'rename',
  	"from" varchar,
  	"to" varchar,
  	"active" boolean DEFAULT true,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer,
  	"confidence" numeric,
  	"auto_detected" boolean DEFAULT false
  );
  
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "schema_validation_transform_suggestions" jsonb;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_schema_validation_transform_suggestions" jsonb;
  ALTER TABLE "payload"."datasets_import_transforms" ADD CONSTRAINT "datasets_import_transforms_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."datasets_import_transforms" ADD CONSTRAINT "datasets_import_transforms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD CONSTRAINT "_datasets_v_version_import_transforms_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD CONSTRAINT "_datasets_v_version_import_transforms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "datasets_import_transforms_order_idx" ON "payload"."datasets_import_transforms" USING btree ("_order");
  CREATE INDEX "datasets_import_transforms_parent_id_idx" ON "payload"."datasets_import_transforms" USING btree ("_parent_id");
  CREATE INDEX "datasets_import_transforms_added_by_idx" ON "payload"."datasets_import_transforms" USING btree ("added_by_id");
  CREATE INDEX "_datasets_v_version_import_transforms_order_idx" ON "payload"."_datasets_v_version_import_transforms" USING btree ("_order");
  CREATE INDEX "_datasets_v_version_import_transforms_parent_id_idx" ON "payload"."_datasets_v_version_import_transforms" USING btree ("_parent_id");
  CREATE INDEX "_datasets_v_version_import_transforms_added_by_idx" ON "payload"."_datasets_v_version_import_transforms" USING btree ("added_by_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."datasets_import_transforms" CASCADE;
  DROP TABLE "payload"."_datasets_v_version_import_transforms" CASCADE;
  ALTER TABLE "payload"."import_jobs" DROP COLUMN "schema_validation_transform_suggestions";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_schema_validation_transform_suggestions";
  DROP TYPE "payload"."enum_datasets_import_transforms_type";
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_type";`);
}
