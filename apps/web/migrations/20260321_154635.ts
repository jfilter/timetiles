import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."si_response_format" AS ENUM('auto', 'csv', 'json');
  CREATE TYPE "payload"."si_json_paging_type" AS ENUM('offset', 'cursor', 'page');
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_response_format" "payload"."si_response_format" DEFAULT 'auto';
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_records_path" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_pagination_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_pagination_type" "payload"."si_json_paging_type";
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_pagination_page_param" varchar DEFAULT 'page';
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_pagination_limit_param" varchar DEFAULT 'limit';
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_pagination_limit_value" numeric DEFAULT 100;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_pagination_cursor_param" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_pagination_next_cursor_path" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_pagination_total_path" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_json_api_config_pagination_max_pages" numeric DEFAULT 50;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_response_format" "payload"."si_response_format" DEFAULT 'auto';
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_records_path" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_type" "payload"."si_json_paging_type";
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_page_param" varchar DEFAULT 'page';
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_limit_param" varchar DEFAULT 'limit';
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_limit_value" numeric DEFAULT 100;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_cursor_param" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_next_cursor_path" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_total_path" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_max_pages" numeric DEFAULT 50;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_response_format";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_records_path";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_pagination_enabled";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_pagination_type";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_pagination_page_param";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_pagination_limit_param";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_pagination_limit_value";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_pagination_cursor_param";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_pagination_next_cursor_path";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_pagination_total_path";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_json_api_config_pagination_max_pages";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_response_format";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_records_path";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_enabled";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_type";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_page_param";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_limit_param";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_limit_value";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_cursor_param";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_next_cursor_path";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_total_path";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_max_pages";
  DROP TYPE "payload"."si_response_format";
  DROP TYPE "payload"."si_json_paging_type";`)
}
