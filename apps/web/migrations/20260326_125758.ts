import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_geocoding_providers_config_photon_layer" AS ENUM('house', 'street', 'locality', 'district', 'city', 'county', 'state', 'country');
  CREATE TYPE "payload"."enum__geocoding_providers_v_version_config_photon_layer" AS ENUM('house', 'street', 'locality', 'district', 'city', 'county', 'state', 'country');
  CREATE TABLE "payload"."geocoding_providers_config_photon_layer" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_geocoding_providers_config_photon_layer",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."_geocoding_providers_v_version_config_photon_layer" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__geocoding_providers_v_version_config_photon_layer",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_location_bias_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_location_bias_lat" numeric;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_location_bias_lon" numeric;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_location_bias_zoom" numeric DEFAULT 10;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_bbox_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_bbox_min_lon" numeric;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_bbox_min_lat" numeric;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_bbox_max_lon" numeric;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_bbox_max_lat" numeric;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "config_photon_osm_tag" varchar;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_location_bias_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_location_bias_lat" numeric;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_location_bias_lon" numeric;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_location_bias_zoom" numeric DEFAULT 10;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_bbox_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_bbox_min_lon" numeric;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_bbox_min_lat" numeric;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_bbox_max_lon" numeric;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_bbox_max_lat" numeric;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_config_photon_osm_tag" varchar;
  ALTER TABLE "payload"."geocoding_providers_config_photon_layer" ADD CONSTRAINT "geocoding_providers_config_photon_layer_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."geocoding_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_geocoding_providers_v_version_config_photon_layer" ADD CONSTRAINT "_geocoding_providers_v_version_config_photon_layer_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_geocoding_providers_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "geocoding_providers_config_photon_layer_order_idx" ON "payload"."geocoding_providers_config_photon_layer" USING btree ("order");
  CREATE INDEX "geocoding_providers_config_photon_layer_parent_idx" ON "payload"."geocoding_providers_config_photon_layer" USING btree ("parent_id");
  CREATE INDEX "_geocoding_providers_v_version_config_photon_layer_order_idx" ON "payload"."_geocoding_providers_v_version_config_photon_layer" USING btree ("order");
  CREATE INDEX "_geocoding_providers_v_version_config_photon_layer_parent_idx" ON "payload"."_geocoding_providers_v_version_config_photon_layer" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."geocoding_providers_config_photon_layer" CASCADE;
  DROP TABLE "payload"."_geocoding_providers_v_version_config_photon_layer" CASCADE;
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_location_bias_enabled";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_location_bias_lat";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_location_bias_lon";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_location_bias_zoom";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_bbox_enabled";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_bbox_min_lon";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_bbox_min_lat";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_bbox_max_lon";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_bbox_max_lat";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "config_photon_osm_tag";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_location_bias_enabled";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_location_bias_lat";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_location_bias_lon";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_location_bias_zoom";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_bbox_enabled";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_bbox_min_lon";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_bbox_min_lat";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_bbox_max_lon";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_bbox_max_lat";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_config_photon_osm_tag";
  DROP TYPE "payload"."enum_geocoding_providers_config_photon_layer";
  DROP TYPE "payload"."enum__geocoding_providers_v_version_config_photon_layer";`)
}
