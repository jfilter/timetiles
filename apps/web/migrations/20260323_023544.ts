import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."sites_embedding_config_allowed_origins" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"origin" varchar
  );
  
  CREATE TABLE "payload"."_sites_v_version_embedding_config_allowed_origins" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"origin" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."sites_embedding_config_allowed_origins" ADD CONSTRAINT "sites_embedding_config_allowed_origins_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_sites_v_version_embedding_config_allowed_origins" ADD CONSTRAINT "_sites_v_version_embedding_config_allowed_origins_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_sites_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sites_embedding_config_allowed_origins_order_idx" ON "payload"."sites_embedding_config_allowed_origins" USING btree ("_order");
  CREATE INDEX "sites_embedding_config_allowed_origins_parent_id_idx" ON "payload"."sites_embedding_config_allowed_origins" USING btree ("_parent_id");
  CREATE INDEX "_sites_v_version_embedding_config_allowed_origins_order_idx" ON "payload"."_sites_v_version_embedding_config_allowed_origins" USING btree ("_order");
  CREATE INDEX "_sites_v_version_embedding_config_allowed_origins_parent_id_idx" ON "payload"."_sites_v_version_embedding_config_allowed_origins" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'process-pending-retries' BEFORE 'quota-reset';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'process-pending-retries' BEFORE 'quota-reset';
  DROP TABLE "payload"."sites_embedding_config_allowed_origins" CASCADE;
  DROP TABLE "payload"."_sites_v_version_embedding_config_allowed_origins" CASCADE;`)
}
