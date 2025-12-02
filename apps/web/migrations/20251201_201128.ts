import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."schema_detectors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"description" varchar,
  	"enabled" boolean DEFAULT true,
  	"priority" numeric DEFAULT 100,
  	"options" jsonb,
  	"statistics_total_runs" numeric DEFAULT 0,
  	"statistics_last_used" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."datasets" ADD COLUMN "schema_detector_id" integer;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_schema_detector_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "schema_detectors_id" integer;
  CREATE UNIQUE INDEX "schema_detectors_name_idx" ON "payload"."schema_detectors" USING btree ("name");
  CREATE INDEX "schema_detectors_updated_at_idx" ON "payload"."schema_detectors" USING btree ("updated_at");
  CREATE INDEX "schema_detectors_created_at_idx" ON "payload"."schema_detectors" USING btree ("created_at");
  ALTER TABLE "payload"."datasets" ADD CONSTRAINT "datasets_schema_detector_id_schema_detectors_id_fk" FOREIGN KEY ("schema_detector_id") REFERENCES "payload"."schema_detectors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v" ADD CONSTRAINT "_datasets_v_version_schema_detector_id_schema_detectors_id_fk" FOREIGN KEY ("version_schema_detector_id") REFERENCES "payload"."schema_detectors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_schema_detectors_fk" FOREIGN KEY ("schema_detectors_id") REFERENCES "payload"."schema_detectors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "datasets_schema_detector_idx" ON "payload"."datasets" USING btree ("schema_detector_id");
  CREATE INDEX "_datasets_v_version_version_schema_detector_idx" ON "payload"."_datasets_v" USING btree ("version_schema_detector_id");
  CREATE INDEX "payload_locked_documents_rels_schema_detectors_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("schema_detectors_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."schema_detectors" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."schema_detectors" CASCADE;
  ALTER TABLE "payload"."datasets" DROP CONSTRAINT "datasets_schema_detector_id_schema_detectors_id_fk";
  
  ALTER TABLE "payload"."_datasets_v" DROP CONSTRAINT "_datasets_v_version_schema_detector_id_schema_detectors_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_schema_detectors_fk";
  
  DROP INDEX "payload"."datasets_schema_detector_idx";
  DROP INDEX "payload"."_datasets_v_version_version_schema_detector_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_schema_detectors_id_idx";
  ALTER TABLE "payload"."datasets" DROP COLUMN "schema_detector_id";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_schema_detector_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "schema_detectors_id";`)
}
