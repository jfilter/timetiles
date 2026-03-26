import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_geocoding_providers_type" ADD VALUE 'locationiq' BEFORE 'nominatim';
  ALTER TYPE "payload"."enum_geocoding_providers_type" ADD VALUE 'photon';
  ALTER TYPE "payload"."enum__geocoding_providers_v_version_type" ADD VALUE 'locationiq' BEFORE 'nominatim';
  ALTER TYPE "payload"."enum__geocoding_providers_v_version_type" ADD VALUE 'photon';
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_locationiq_api_key" varchar;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_locationiq_countrycodes" varchar;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_base_url" varchar DEFAULT 'https://photon.komoot.io';
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_language" varchar;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_limit" numeric DEFAULT 5;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_locationiq_api_key" varchar;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_locationiq_countrycodes" varchar;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_base_url" varchar DEFAULT 'https://photon.komoot.io';
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_language" varchar;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_limit" numeric DEFAULT 5;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."geocoding_providers" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "payload"."enum_geocoding_providers_type";
  CREATE TYPE "payload"."enum_geocoding_providers_type" AS ENUM('google', 'nominatim', 'opencage');
  ALTER TABLE "payload"."geocoding_providers" ALTER COLUMN "type" SET DATA TYPE "payload"."enum_geocoding_providers_type" USING "type"::"payload"."enum_geocoding_providers_type";
  ALTER TABLE "payload"."_geocoding_providers_v" ALTER COLUMN "version_type" SET DATA TYPE text;
  DROP TYPE "payload"."enum__geocoding_providers_v_version_type";
  CREATE TYPE "payload"."enum__geocoding_providers_v_version_type" AS ENUM('google', 'nominatim', 'opencage');
  ALTER TABLE "payload"."_geocoding_providers_v" ALTER COLUMN "version_type" SET DATA TYPE "payload"."enum__geocoding_providers_v_version_type" USING "version_type"::"payload"."enum__geocoding_providers_v_version_type";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_locationiq_api_key";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_locationiq_countrycodes";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_base_url";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_language";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_limit";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_locationiq_api_key";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_locationiq_countrycodes";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_base_url";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_language";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_limit";`)
}
