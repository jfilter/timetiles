import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "review_reason" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "review_details" jsonb;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_review_reason" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_review_details" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "review_reason";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "review_details";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_review_reason";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_review_details";`)
}
