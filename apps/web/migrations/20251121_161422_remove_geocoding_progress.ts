import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_jobs" DROP COLUMN "geocoding_progress_current";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN "geocoding_progress_total";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_geocoding_progress_current";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_geocoding_progress_total";`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_jobs" ADD COLUMN "geocoding_progress_current" numeric DEFAULT 0;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "geocoding_progress_total" numeric;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_geocoding_progress_current" numeric DEFAULT 0;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_geocoding_progress_total" numeric;`);
}
