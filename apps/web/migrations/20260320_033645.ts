import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_jobs" ADD COLUMN "concurrency_key" varchar;
  CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload"."payload_jobs" USING btree ("concurrency_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."payload_jobs_concurrency_key_idx";
  ALTER TABLE "payload"."payload_jobs" DROP COLUMN "concurrency_key";`)
}
