import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_jobs" DROP COLUMN "geocoding_candidates";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_geocoding_candidates";`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_jobs" ADD COLUMN "geocoding_candidates" jsonb;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_geocoding_candidates" jsonb;`);
}
