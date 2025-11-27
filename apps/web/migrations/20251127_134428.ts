import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'schema-maintenance' BEFORE 'data-export';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'schema-maintenance' BEFORE 'data-export';
  ALTER TABLE "payload"."events" ADD COLUMN "dataset_is_public" boolean DEFAULT false;
  ALTER TABLE "payload"."events" ADD COLUMN "catalog_owner_id" numeric;
  ALTER TABLE "payload"."_events_v" ADD COLUMN "version_dataset_is_public" boolean DEFAULT false;
  ALTER TABLE "payload"."_events_v" ADD COLUMN "version_catalog_owner_id" numeric;
  ALTER TABLE "payload"."datasets" ADD COLUMN "catalog_creator_id" numeric;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_catalog_creator_id" numeric;
  CREATE INDEX "events_dataset_is_public_idx" ON "payload"."events" USING btree ("dataset_is_public");
  CREATE INDEX "events_catalog_owner_id_idx" ON "payload"."events" USING btree ("catalog_owner_id");
  CREATE INDEX "_events_v_version_version_dataset_is_public_idx" ON "payload"."_events_v" USING btree ("version_dataset_is_public");
  CREATE INDEX "datasets_catalog_creator_id_idx" ON "payload"."datasets" USING btree ("catalog_creator_id");
  ALTER TABLE "payload"."datasets" DROP COLUMN "event_stats_event_count";
  ALTER TABLE "payload"."datasets" DROP COLUMN "event_stats_last_event_updated_at";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_event_stats_event_count";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_event_stats_last_event_updated_at";`)

  // Populate datasetIsPublic and catalogOwnerId from datasets/catalogs for existing events
  await db.execute(sql`
    UPDATE "payload"."events" e
    SET "dataset_is_public" = d."is_public",
        "catalog_owner_id" = c."created_by_id"
    FROM "payload"."datasets" d
    JOIN "payload"."catalogs" c ON d."catalog_id" = c."id"
    WHERE e."dataset_id" = d."id";
  `)

  // Populate catalogCreatorId for existing datasets
  await db.execute(sql`
    UPDATE "payload"."datasets" d
    SET "catalog_creator_id" = c."created_by_id"
    FROM "payload"."catalogs" c
    WHERE d."catalog_id" = c."id";
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'data-export', 'data-export-cleanup');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'data-export', 'data-export-cleanup');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  DROP INDEX "payload"."events_dataset_is_public_idx";
  DROP INDEX "payload"."events_catalog_owner_id_idx";
  DROP INDEX "payload"."_events_v_version_version_dataset_is_public_idx";
  DROP INDEX "payload"."datasets_catalog_creator_id_idx";
  ALTER TABLE "payload"."datasets" ADD COLUMN "event_stats_event_count" numeric DEFAULT 0;
  ALTER TABLE "payload"."datasets" ADD COLUMN "event_stats_last_event_updated_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_event_stats_event_count" numeric DEFAULT 0;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_event_stats_last_event_updated_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."events" DROP COLUMN "dataset_is_public";
  ALTER TABLE "payload"."events" DROP COLUMN "catalog_owner_id";
  ALTER TABLE "payload"."_events_v" DROP COLUMN "version_dataset_is_public";
  ALTER TABLE "payload"."_events_v" DROP COLUMN "version_catalog_owner_id";
  ALTER TABLE "payload"."datasets" DROP COLUMN "catalog_creator_id";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_catalog_creator_id";`)
}
