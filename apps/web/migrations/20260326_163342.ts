import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_scheduled_ingests_auth_config_type" ADD VALUE 'oauth';
  ALTER TYPE "payload"."enum__scheduled_ingests_v_version_auth_config_type" ADD VALUE 'oauth';
  ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_duplicate_strategy" SET DATA TYPE text;
  ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_duplicate_strategy" SET DEFAULT 'skip'::text;
  DROP TYPE "payload"."enum_datasets_id_strategy_duplicate_strategy";
  CREATE TYPE "payload"."enum_datasets_id_strategy_duplicate_strategy" AS ENUM('skip', 'update');
  ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_duplicate_strategy" SET DEFAULT 'skip'::"payload"."enum_datasets_id_strategy_duplicate_strategy";
  ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_duplicate_strategy" SET DATA TYPE "payload"."enum_datasets_id_strategy_duplicate_strategy" USING "id_strategy_duplicate_strategy"::"payload"."enum_datasets_id_strategy_duplicate_strategy";
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_duplicate_strategy" SET DATA TYPE text;
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_duplicate_strategy" SET DEFAULT 'skip'::text;
  DROP TYPE "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy";
  CREATE TYPE "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy" AS ENUM('skip', 'update');
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_duplicate_strategy" SET DEFAULT 'skip'::"payload"."enum__datasets_v_version_id_strategy_duplicate_strategy";
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_duplicate_strategy" SET DATA TYPE "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy" USING "version_id_strategy_duplicate_strategy"::"payload"."enum__datasets_v_version_id_strategy_duplicate_strategy";
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "auth_config_token_url" varchar;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "auth_config_client_id" varchar;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_country_codes" jsonb;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_view_box_min_lon" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_view_box_min_lat" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_view_box_max_lon" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_view_box_max_lat" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_bounded" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_auth_config_token_url" varchar;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_auth_config_client_id" varchar;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_country_codes" jsonb;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_view_box_min_lon" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_view_box_min_lat" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_view_box_max_lon" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_view_box_max_lat" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_bounded" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_datasets_id_strategy_duplicate_strategy" ADD VALUE 'version';
  ALTER TYPE "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy" ADD VALUE 'version';
  ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "auth_config_type" SET DATA TYPE text;
  ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "auth_config_type" SET DEFAULT 'none'::text;
  DROP TYPE "payload"."enum_scheduled_ingests_auth_config_type";
  CREATE TYPE "payload"."enum_scheduled_ingests_auth_config_type" AS ENUM('none', 'api-key', 'bearer', 'basic');
  ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "auth_config_type" SET DEFAULT 'none'::"payload"."enum_scheduled_ingests_auth_config_type";
  ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "auth_config_type" SET DATA TYPE "payload"."enum_scheduled_ingests_auth_config_type" USING "auth_config_type"::"payload"."enum_scheduled_ingests_auth_config_type";
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_auth_config_type" SET DATA TYPE text;
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_auth_config_type" SET DEFAULT 'none'::text;
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_auth_config_type";
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_auth_config_type" AS ENUM('none', 'api-key', 'bearer', 'basic');
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_auth_config_type" SET DEFAULT 'none'::"payload"."enum__scheduled_ingests_v_version_auth_config_type";
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_auth_config_type" SET DATA TYPE "payload"."enum__scheduled_ingests_v_version_auth_config_type" USING "version_auth_config_type"::"payload"."enum__scheduled_ingests_v_version_auth_config_type";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "auth_config_token_url";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "auth_config_client_id";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_country_codes";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_view_box_min_lon";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_view_box_min_lat";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_view_box_max_lon";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_view_box_max_lat";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_bounded";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_auth_config_token_url";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_auth_config_client_id";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_country_codes";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_view_box_min_lon";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_view_box_min_lat";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_view_box_max_lon";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_view_box_max_lat";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_bounded";`)
}
