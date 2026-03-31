import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_json_api_config_pagination_initial_body_template" varchar;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_initial_body_template" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_json_api_config_pagination_initial_body_template";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_initial_body_template";`)
}
