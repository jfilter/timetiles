import { sql } from "@payloadcms/db-postgres";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_import_jobs_stage" ADD VALUE 'create-schema-version' BEFORE 'geocode-batch';
  ALTER TYPE "payload"."enum__import_jobs_v_version_stage" ADD VALUE 'create-schema-version' BEFORE 'geocode-batch';`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_jobs" ALTER COLUMN "stage" SET DATA TYPE text;
  ALTER TABLE "payload"."import_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum_import_jobs_stage";
  CREATE TYPE "payload"."enum_import_jobs_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."import_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum_import_jobs_stage";
  ALTER TABLE "payload"."import_jobs" ALTER COLUMN "stage" SET DATA TYPE "payload"."enum_import_jobs_stage" USING "stage"::"payload"."enum_import_jobs_stage";
  ALTER TABLE "payload"."_import_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE text;
  ALTER TABLE "payload"."_import_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum__import_jobs_v_version_stage";
  CREATE TYPE "payload"."enum__import_jobs_v_version_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."_import_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum__import_jobs_v_version_stage";
  ALTER TABLE "payload"."_import_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE "payload"."enum__import_jobs_v_version_stage" USING "version_stage"::"payload"."enum__import_jobs_v_version_stage";`);
}
