import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export const up = async ({ db }: MigrateUpArgs): Promise<void> => {
  // Add new generic top-level columns
  await db.execute(sql`
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "language" varchar;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "country_codes" varchar;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "location_bias_enabled" boolean DEFAULT false;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "location_bias_lat" numeric;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "location_bias_lon" numeric;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "location_bias_zoom" numeric DEFAULT 10;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "bounding_box_enabled" boolean DEFAULT false;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "bounding_box_min_lon" numeric;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "bounding_box_min_lat" numeric;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "bounding_box_max_lon" numeric;
    ALTER TABLE "payload"."geocoding_providers" ADD COLUMN IF NOT EXISTS "bounding_box_max_lat" numeric;

    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_language" varchar;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_country_codes" varchar;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_location_bias_enabled" boolean DEFAULT false;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_location_bias_lat" numeric;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_location_bias_lon" numeric;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_location_bias_zoom" numeric DEFAULT 10;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_bounding_box_enabled" boolean DEFAULT false;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_bounding_box_min_lon" numeric;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_bounding_box_min_lat" numeric;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_bounding_box_max_lon" numeric;
    ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN IF NOT EXISTS "version_bounding_box_max_lat" numeric;
  `);

  // Migrate existing data: copy provider-specific values to generic columns
  await db.execute(sql`
    UPDATE "payload"."geocoding_providers" SET "language" = "config_google_language" WHERE "type" = 'google' AND "config_google_language" IS NOT NULL;
    UPDATE "payload"."geocoding_providers" SET "country_codes" = "config_google_region" WHERE "type" = 'google' AND "config_google_region" IS NOT NULL;
    UPDATE "payload"."geocoding_providers" SET "country_codes" = "config_nominatim_countrycodes" WHERE "type" = 'nominatim' AND "config_nominatim_countrycodes" IS NOT NULL;
    UPDATE "payload"."geocoding_providers" SET "language" = "config_opencage_language", "country_codes" = "config_opencage_countrycode" WHERE "type" = 'opencage';
    UPDATE "payload"."geocoding_providers" SET "country_codes" = "config_locationiq_countrycodes" WHERE "type" = 'locationiq' AND "config_locationiq_countrycodes" IS NOT NULL;
    UPDATE "payload"."geocoding_providers" SET "language" = "config_photon_language" WHERE "type" = 'photon' AND "config_photon_language" IS NOT NULL;
    UPDATE "payload"."geocoding_providers" SET
      "location_bias_enabled" = "config_photon_location_bias_enabled",
      "location_bias_lat" = "config_photon_location_bias_lat",
      "location_bias_lon" = "config_photon_location_bias_lon",
      "location_bias_zoom" = "config_photon_location_bias_zoom"
    WHERE "type" = 'photon' AND "config_photon_location_bias_enabled" = true;
    UPDATE "payload"."geocoding_providers" SET
      "bounding_box_enabled" = "config_photon_bbox_enabled",
      "bounding_box_min_lon" = "config_photon_bbox_min_lon",
      "bounding_box_min_lat" = "config_photon_bbox_min_lat",
      "bounding_box_max_lon" = "config_photon_bbox_max_lon",
      "bounding_box_max_lat" = "config_photon_bbox_max_lat"
    WHERE "type" = 'photon' AND "config_photon_bbox_enabled" = true;
    UPDATE "payload"."geocoding_providers" SET
      "bounding_box_enabled" = "config_opencage_bounds_enabled",
      "bounding_box_min_lat" = "config_opencage_bounds_southwest_lat",
      "bounding_box_min_lon" = "config_opencage_bounds_southwest_lng",
      "bounding_box_max_lat" = "config_opencage_bounds_northeast_lat",
      "bounding_box_max_lon" = "config_opencage_bounds_northeast_lng"
    WHERE "type" = 'opencage' AND "config_opencage_bounds_enabled" = true;
  `);

  // Drop old provider-specific columns that are now generic
  await db.execute(sql`
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_google_region";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_google_language";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_nominatim_countrycodes";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_opencage_language";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_opencage_countrycode";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_opencage_bounds_enabled";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_opencage_bounds_southwest_lat";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_opencage_bounds_southwest_lng";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_opencage_bounds_northeast_lat";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_opencage_bounds_northeast_lng";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_locationiq_countrycodes";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_language";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_location_bias_enabled";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_location_bias_lat";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_location_bias_lon";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_location_bias_zoom";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_bbox_enabled";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_bbox_min_lon";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_bbox_min_lat";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_bbox_max_lon";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "config_photon_bbox_max_lat";

    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_google_region";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_google_language";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_nominatim_countrycodes";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_opencage_language";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_opencage_countrycode";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_opencage_bounds_enabled";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_opencage_bounds_southwest_lat";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_opencage_bounds_southwest_lng";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_opencage_bounds_northeast_lat";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_opencage_bounds_northeast_lng";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_locationiq_countrycodes";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_language";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_location_bias_enabled";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_location_bias_lat";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_location_bias_lon";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_location_bias_zoom";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_bbox_enabled";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_bbox_min_lon";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_bbox_min_lat";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_bbox_max_lon";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_config_photon_bbox_max_lat";
  `);
};

export const down = async ({ db }: MigrateDownArgs): Promise<void> => {
  await db.execute(sql`
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "language";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "country_codes";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "location_bias_enabled";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "location_bias_lat";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "location_bias_lon";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "location_bias_zoom";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "bounding_box_enabled";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "bounding_box_min_lon";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "bounding_box_min_lat";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "bounding_box_max_lon";
    ALTER TABLE "payload"."geocoding_providers" DROP COLUMN IF EXISTS "bounding_box_max_lat";

    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_language";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_country_codes";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_location_bias_enabled";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_location_bias_lat";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_location_bias_lon";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_location_bias_zoom";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_bounding_box_enabled";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_bounding_box_min_lon";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_bounding_box_min_lat";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_bounding_box_max_lon";
    ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN IF EXISTS "version_bounding_box_max_lat";
  `);
};
