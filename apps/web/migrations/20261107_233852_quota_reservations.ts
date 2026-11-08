import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."quota_reservations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ingest_job_id" integer,
  	"generation" numeric NOT NULL,
  	"user_id" integer,
  	"amount" numeric NOT NULL,
  	"settled" boolean DEFAULT false NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "quota_reservations_id" integer;
  ALTER TABLE "payload"."quota_reservations" ADD CONSTRAINT "quota_reservations_ingest_job_id_ingest_jobs_id_fk" FOREIGN KEY ("ingest_job_id") REFERENCES "payload"."ingest_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."quota_reservations" ADD CONSTRAINT "quota_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "quota_reservations_ingest_job_idx" ON "payload"."quota_reservations" USING btree ("ingest_job_id");
  CREATE INDEX "quota_reservations_user_idx" ON "payload"."quota_reservations" USING btree ("user_id");
  CREATE INDEX "quota_reservations_updated_at_idx" ON "payload"."quota_reservations" USING btree ("updated_at");
  CREATE INDEX "quota_reservations_created_at_idx" ON "payload"."quota_reservations" USING btree ("created_at");
  CREATE UNIQUE INDEX "ingestJob_generation_idx" ON "payload"."quota_reservations" USING btree ("ingest_job_id","generation");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quota_reservations_fk" FOREIGN KEY ("quota_reservations_id") REFERENCES "payload"."quota_reservations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_quota_reservations_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("quota_reservations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The generator dropped the constraint after `DROP TABLE … CASCADE`, which already removes it.
  await db.execute(sql`
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quota_reservations_fk";
  ALTER TABLE "payload"."quota_reservations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."quota_reservations" CASCADE;
  DROP INDEX "payload"."payload_locked_documents_rels_quota_reservations_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "quota_reservations_id";`)
}
