import { sql } from "@payloadcms/db-postgres";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_max_file_size_m_b" numeric;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_max_file_size_m_b" numeric;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_max_file_size_m_b";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_max_file_size_m_b";`);
}
