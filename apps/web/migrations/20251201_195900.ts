import type { MigrateUpArgs, MigrateDownArgs} from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_views_data_scope_mode" AS ENUM('all', 'catalogs', 'datasets');
  CREATE TYPE "payload"."enum_views_filter_config_mode" AS ENUM('auto', 'manual', 'disabled');
  CREATE TYPE "payload"."enum_views_map_settings_base_map_style" AS ENUM('default', 'light', 'dark', 'satellite');
  CREATE TYPE "payload"."enum_views_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__views_v_version_data_scope_mode" AS ENUM('all', 'catalogs', 'datasets');
  CREATE TYPE "payload"."enum__views_v_version_filter_config_mode" AS ENUM('auto', 'manual', 'disabled');
  CREATE TYPE "payload"."enum__views_v_version_map_settings_base_map_style" AS ENUM('default', 'light', 'dark', 'satellite');
  CREATE TYPE "payload"."enum__views_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "payload"."views_filter_config_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"enabled" boolean DEFAULT true,
  	"label" varchar,
  	"display_order" numeric DEFAULT 0,
  	"max_values" numeric DEFAULT 15
  );
  
  CREATE TABLE "payload"."views" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"is_default" boolean DEFAULT false,
  	"data_scope_mode" "payload"."enum_views_data_scope_mode" DEFAULT 'all',
  	"filter_config_mode" "payload"."enum_views_filter_config_mode" DEFAULT 'auto',
  	"filter_config_max_filters" numeric DEFAULT 5,
  	"filter_config_default_filters" jsonb,
  	"branding_domain" varchar,
  	"branding_title" varchar,
  	"branding_logo_id" integer,
  	"branding_favicon_id" integer,
  	"branding_colors_primary" varchar,
  	"branding_colors_secondary" varchar,
  	"branding_colors_background" varchar,
  	"branding_header_html" varchar,
  	"map_settings_default_bounds_north" numeric,
  	"map_settings_default_bounds_south" numeric,
  	"map_settings_default_bounds_east" numeric,
  	"map_settings_default_bounds_west" numeric,
  	"map_settings_default_zoom" numeric,
  	"map_settings_default_center_latitude" numeric,
  	"map_settings_default_center_longitude" numeric,
  	"map_settings_base_map_style" "payload"."enum_views_map_settings_base_map_style" DEFAULT 'default',
  	"map_settings_custom_style_url" varchar,
  	"is_public" boolean DEFAULT true,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_views_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."views_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"catalogs_id" integer,
  	"datasets_id" integer
  );
  
  CREATE TABLE "payload"."_views_v_version_filter_config_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"enabled" boolean DEFAULT true,
  	"label" varchar,
  	"display_order" numeric DEFAULT 0,
  	"max_values" numeric DEFAULT 15,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_views_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_is_default" boolean DEFAULT false,
  	"version_data_scope_mode" "payload"."enum__views_v_version_data_scope_mode" DEFAULT 'all',
  	"version_filter_config_mode" "payload"."enum__views_v_version_filter_config_mode" DEFAULT 'auto',
  	"version_filter_config_max_filters" numeric DEFAULT 5,
  	"version_filter_config_default_filters" jsonb,
  	"version_branding_domain" varchar,
  	"version_branding_title" varchar,
  	"version_branding_logo_id" integer,
  	"version_branding_favicon_id" integer,
  	"version_branding_colors_primary" varchar,
  	"version_branding_colors_secondary" varchar,
  	"version_branding_colors_background" varchar,
  	"version_branding_header_html" varchar,
  	"version_map_settings_default_bounds_north" numeric,
  	"version_map_settings_default_bounds_south" numeric,
  	"version_map_settings_default_bounds_east" numeric,
  	"version_map_settings_default_bounds_west" numeric,
  	"version_map_settings_default_zoom" numeric,
  	"version_map_settings_default_center_latitude" numeric,
  	"version_map_settings_default_center_longitude" numeric,
  	"version_map_settings_base_map_style" "payload"."enum__views_v_version_map_settings_base_map_style" DEFAULT 'default',
  	"version_map_settings_custom_style_url" varchar,
  	"version_is_public" boolean DEFAULT true,
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__views_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."_views_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"catalogs_id" integer,
  	"datasets_id" integer
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "views_id" integer;
  ALTER TABLE "payload"."views_filter_config_fields" ADD CONSTRAINT "views_filter_config_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."views"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."views" ADD CONSTRAINT "views_branding_logo_id_media_id_fk" FOREIGN KEY ("branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."views" ADD CONSTRAINT "views_branding_favicon_id_media_id_fk" FOREIGN KEY ("branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."views" ADD CONSTRAINT "views_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."views_rels" ADD CONSTRAINT "views_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."views"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."views_rels" ADD CONSTRAINT "views_rels_catalogs_fk" FOREIGN KEY ("catalogs_id") REFERENCES "payload"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."views_rels" ADD CONSTRAINT "views_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_views_v_version_filter_config_fields" ADD CONSTRAINT "_views_v_version_filter_config_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_views_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_parent_id_views_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."views"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_branding_logo_id_media_id_fk" FOREIGN KEY ("version_branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_branding_favicon_id_media_id_fk" FOREIGN KEY ("version_branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v_rels" ADD CONSTRAINT "_views_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_views_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_views_v_rels" ADD CONSTRAINT "_views_v_rels_catalogs_fk" FOREIGN KEY ("catalogs_id") REFERENCES "payload"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_views_v_rels" ADD CONSTRAINT "_views_v_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "views_filter_config_fields_order_idx" ON "payload"."views_filter_config_fields" USING btree ("_order");
  CREATE INDEX "views_filter_config_fields_parent_id_idx" ON "payload"."views_filter_config_fields" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "views_slug_idx" ON "payload"."views" USING btree ("slug");
  CREATE INDEX "views_branding_branding_logo_idx" ON "payload"."views" USING btree ("branding_logo_id");
  CREATE INDEX "views_branding_branding_favicon_idx" ON "payload"."views" USING btree ("branding_favicon_id");
  CREATE INDEX "views_created_by_idx" ON "payload"."views" USING btree ("created_by_id");
  CREATE INDEX "views_updated_at_idx" ON "payload"."views" USING btree ("updated_at");
  CREATE INDEX "views_created_at_idx" ON "payload"."views" USING btree ("created_at");
  CREATE INDEX "views_deleted_at_idx" ON "payload"."views" USING btree ("deleted_at");
  CREATE INDEX "views__status_idx" ON "payload"."views" USING btree ("_status");
  CREATE INDEX "views_rels_order_idx" ON "payload"."views_rels" USING btree ("order");
  CREATE INDEX "views_rels_parent_idx" ON "payload"."views_rels" USING btree ("parent_id");
  CREATE INDEX "views_rels_path_idx" ON "payload"."views_rels" USING btree ("path");
  CREATE INDEX "views_rels_catalogs_id_idx" ON "payload"."views_rels" USING btree ("catalogs_id");
  CREATE INDEX "views_rels_datasets_id_idx" ON "payload"."views_rels" USING btree ("datasets_id");
  CREATE INDEX "_views_v_version_filter_config_fields_order_idx" ON "payload"."_views_v_version_filter_config_fields" USING btree ("_order");
  CREATE INDEX "_views_v_version_filter_config_fields_parent_id_idx" ON "payload"."_views_v_version_filter_config_fields" USING btree ("_parent_id");
  CREATE INDEX "_views_v_parent_idx" ON "payload"."_views_v" USING btree ("parent_id");
  CREATE INDEX "_views_v_version_version_slug_idx" ON "payload"."_views_v" USING btree ("version_slug");
  CREATE INDEX "_views_v_version_branding_version_branding_logo_idx" ON "payload"."_views_v" USING btree ("version_branding_logo_id");
  CREATE INDEX "_views_v_version_branding_version_branding_favicon_idx" ON "payload"."_views_v" USING btree ("version_branding_favicon_id");
  CREATE INDEX "_views_v_version_version_created_by_idx" ON "payload"."_views_v" USING btree ("version_created_by_id");
  CREATE INDEX "_views_v_version_version_updated_at_idx" ON "payload"."_views_v" USING btree ("version_updated_at");
  CREATE INDEX "_views_v_version_version_created_at_idx" ON "payload"."_views_v" USING btree ("version_created_at");
  CREATE INDEX "_views_v_version_version_deleted_at_idx" ON "payload"."_views_v" USING btree ("version_deleted_at");
  CREATE INDEX "_views_v_version_version__status_idx" ON "payload"."_views_v" USING btree ("version__status");
  CREATE INDEX "_views_v_created_at_idx" ON "payload"."_views_v" USING btree ("created_at");
  CREATE INDEX "_views_v_updated_at_idx" ON "payload"."_views_v" USING btree ("updated_at");
  CREATE INDEX "_views_v_latest_idx" ON "payload"."_views_v" USING btree ("latest");
  CREATE INDEX "_views_v_autosave_idx" ON "payload"."_views_v" USING btree ("autosave");
  CREATE INDEX "_views_v_rels_order_idx" ON "payload"."_views_v_rels" USING btree ("order");
  CREATE INDEX "_views_v_rels_parent_idx" ON "payload"."_views_v_rels" USING btree ("parent_id");
  CREATE INDEX "_views_v_rels_path_idx" ON "payload"."_views_v_rels" USING btree ("path");
  CREATE INDEX "_views_v_rels_catalogs_id_idx" ON "payload"."_views_v_rels" USING btree ("catalogs_id");
  CREATE INDEX "_views_v_rels_datasets_id_idx" ON "payload"."_views_v_rels" USING btree ("datasets_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_views_fk" FOREIGN KEY ("views_id") REFERENCES "payload"."views"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_views_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("views_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."views_filter_config_fields" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."views" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."views_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_views_v_version_filter_config_fields" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_views_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_views_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."views_filter_config_fields" CASCADE;
  DROP TABLE "payload"."views" CASCADE;
  DROP TABLE "payload"."views_rels" CASCADE;
  DROP TABLE "payload"."_views_v_version_filter_config_fields" CASCADE;
  DROP TABLE "payload"."_views_v" CASCADE;
  DROP TABLE "payload"."_views_v_rels" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_views_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_views_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "views_id";
  DROP TYPE "payload"."enum_views_data_scope_mode";
  DROP TYPE "payload"."enum_views_filter_config_mode";
  DROP TYPE "payload"."enum_views_map_settings_base_map_style";
  DROP TYPE "payload"."enum_views_status";
  DROP TYPE "payload"."enum__views_v_version_data_scope_mode";
  DROP TYPE "payload"."enum__views_v_version_filter_config_mode";
  DROP TYPE "payload"."enum__views_v_version_map_settings_base_map_style";
  DROP TYPE "payload"."enum__views_v_version_status";`)
}
