import { type MigrateUpArgs, type MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export const up = async ({ db }: MigrateUpArgs): Promise<void> => {
  await db.execute(sql`
   CREATE SCHEMA IF NOT EXISTS payload;
   CREATE TYPE "payload"."enum_catalogs_status" AS ENUM('active', 'archived');
  CREATE TYPE "payload"."enum_datasets_status" AS ENUM('draft', 'active', 'archived');
  CREATE TYPE "payload"."enum_imports_job_history_job_type" AS ENUM('file-parsing', 'batch-processing', 'geocoding-batch', 'event-creation');
  CREATE TYPE "payload"."enum_imports_job_history_status" AS ENUM('queued', 'running', 'completed', 'failed');
  CREATE TYPE "payload"."enum_imports_status" AS ENUM('pending', 'processing', 'completed', 'failed');
  CREATE TYPE "payload"."enum_imports_processing_stage" AS ENUM('file-parsing', 'row-processing', 'geocoding', 'event-creation', 'completed');
  CREATE TYPE "payload"."enum_imports_coordinate_detection_detection_method" AS ENUM('pattern', 'heuristic', 'manual', 'none');
  CREATE TYPE "payload"."coord_fmt" AS ENUM('decimal', 'dms', 'combined_comma', 'combined_space', 'geojson');
  CREATE TYPE "payload"."enum_events_coordinate_source_type" AS ENUM('import', 'geocoded', 'manual', 'none');
  CREATE TYPE "payload"."enum_events_coordinate_source_validation_status" AS ENUM('valid', 'out_of_range', 'suspicious_zero', 'swapped', 'invalid');
  CREATE TYPE "payload"."enum_events_geocoding_info_provider" AS ENUM('google', 'nominatim', 'manual');
  CREATE TYPE "payload"."enum_users_role" AS ENUM('user', 'admin', 'analyst');
  CREATE TYPE "payload"."enum_geocoding_providers_tags" AS ENUM('production', 'development', 'testing', 'backup', 'primary', 'secondary', 'region-us', 'region-eu', 'region-asia', 'region-global', 'high-volume', 'low-volume', 'free-tier', 'paid-tier');
  CREATE TYPE "payload"."enum_geocoding_providers_type" AS ENUM('google', 'nominatim', 'opencage');
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'file-parsing', 'batch-processing', 'event-creation', 'geocoding-batch');
  CREATE TYPE "payload"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'file-parsing', 'batch-processing', 'event-creation', 'geocoding-batch');
  CREATE TABLE "payload"."catalogs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" jsonb,
  	"slug" varchar,
  	"status" "payload"."enum_catalogs_status" DEFAULT 'active',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."datasets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" jsonb,
  	"slug" varchar,
  	"catalog_id" integer NOT NULL,
  	"language" varchar NOT NULL,
  	"status" "payload"."enum_datasets_status" DEFAULT 'active',
  	"is_public" boolean DEFAULT false,
  	"schema" jsonb NOT NULL,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."imports_job_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"job_id" varchar NOT NULL,
  	"job_type" "payload"."enum_imports_job_history_job_type" NOT NULL,
  	"status" "payload"."enum_imports_job_history_status" NOT NULL,
  	"started_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"error" varchar,
  	"result" jsonb
  );

  CREATE TABLE "payload"."imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"file_name" varchar NOT NULL,
  	"original_name" varchar,
  	"catalog_id" integer NOT NULL,
  	"file_size" numeric,
  	"mime_type" varchar,
  	"user_id" integer,
  	"session_id" varchar,
  	"status" "payload"."enum_imports_status" DEFAULT 'pending',
  	"processing_stage" "payload"."enum_imports_processing_stage" DEFAULT 'file-parsing',
  	"imported_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"row_count" numeric NOT NULL,
  	"error_count" numeric DEFAULT 0,
  	"error_log" varchar,
  	"progress_total_rows" numeric DEFAULT 0,
  	"progress_processed_rows" numeric DEFAULT 0,
  	"progress_geocoded_rows" numeric DEFAULT 0,
  	"progress_created_events" numeric DEFAULT 0,
  	"progress_percentage" numeric DEFAULT 0,
  	"batch_info_batch_size" numeric DEFAULT 100,
  	"batch_info_current_batch" numeric DEFAULT 0,
  	"batch_info_total_batches" numeric DEFAULT 0,
  	"geocoding_stats_total_addresses" numeric DEFAULT 0,
  	"geocoding_stats_successful_geocodes" numeric DEFAULT 0,
  	"geocoding_stats_failed_geocodes" numeric DEFAULT 0,
  	"geocoding_stats_cached_results" numeric DEFAULT 0,
  	"geocoding_stats_google_api_calls" numeric DEFAULT 0,
  	"geocoding_stats_nominatim_api_calls" numeric DEFAULT 0,
  	"geocoding_stats_pre_existing_coordinates" numeric DEFAULT 0,
  	"geocoding_stats_skipped_geocoding" numeric DEFAULT 0,
  	"rate_limit_info" jsonb,
  	"current_job_id" varchar,
  	"coordinate_detection_detected" boolean DEFAULT false,
  	"coordinate_detection_detection_method" "payload"."enum_imports_coordinate_detection_detection_method",
  	"coordinate_detection_column_mapping_latitude_column" varchar,
  	"coordinate_detection_column_mapping_longitude_column" varchar,
  	"coordinate_detection_column_mapping_combined_column" varchar,
  	"coordinate_detection_column_mapping_coordinate_format" "payload"."coord_fmt",
  	"coordinate_detection_detection_confidence" numeric,
  	"coordinate_detection_sample_validation_valid_samples" numeric DEFAULT 0,
  	"coordinate_detection_sample_validation_invalid_samples" numeric DEFAULT 0,
  	"coordinate_detection_sample_validation_swapped_coordinates" boolean DEFAULT false,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"dataset_id" integer NOT NULL,
  	"import_id" integer,
  	"data" jsonb NOT NULL,
  	"location_latitude" numeric,
  	"location_longitude" numeric,
  	"coordinate_source_type" "payload"."enum_events_coordinate_source_type" DEFAULT 'none',
  	"coordinate_source_import_columns_latitude_column" varchar,
  	"coordinate_source_import_columns_longitude_column" varchar,
  	"coordinate_source_import_columns_combined_column" varchar,
  	"coordinate_source_import_columns_format" varchar,
  	"coordinate_source_confidence" numeric,
  	"coordinate_source_validation_status" "payload"."enum_events_coordinate_source_validation_status",
  	"event_timestamp" timestamp(3) with time zone,
  	"is_valid" boolean DEFAULT true,
  	"validation_errors" jsonb,
  	"geocoding_info_original_address" varchar,
  	"geocoding_info_provider" "payload"."enum_events_geocoding_info_provider",
  	"geocoding_info_confidence" numeric,
  	"geocoding_info_normalized_address" varchar,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "payload"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"first_name" varchar,
  	"last_name" varchar,
  	"role" "payload"."enum_users_role" DEFAULT 'user',
  	"is_active" boolean DEFAULT true,
  	"last_login_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_tablet_url" varchar,
  	"sizes_tablet_width" numeric,
  	"sizes_tablet_height" numeric,
  	"sizes_tablet_mime_type" varchar,
  	"sizes_tablet_filesize" numeric,
  	"sizes_tablet_filename" varchar
  );

  CREATE TABLE "payload"."location_cache" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"original_address" varchar NOT NULL,
  	"normalized_address" varchar NOT NULL,
  	"latitude" numeric NOT NULL,
  	"longitude" numeric NOT NULL,
  	"provider" varchar NOT NULL,
  	"confidence" numeric,
  	"hit_count" numeric DEFAULT 1,
  	"last_used" timestamp(3) with time zone,
  	"components_street_number" varchar,
  	"components_street_name" varchar,
  	"components_city" varchar,
  	"components_region" varchar,
  	"components_postal_code" varchar,
  	"components_country" varchar,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."geocoding_providers_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_geocoding_providers_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "payload"."geocoding_providers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "payload"."enum_geocoding_providers_type" NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"priority" numeric DEFAULT 1 NOT NULL,
  	"rate_limit" numeric DEFAULT 10,
  	"config_google_api_key" varchar,
  	"config_google_region" varchar,
  	"config_google_language" varchar DEFAULT 'en',
  	"config_nominatim_base_url" varchar DEFAULT 'https://nominatim.openstreetmap.org',
  	"config_nominatim_user_agent" varchar DEFAULT 'TimeTiles-App/1.0',
  	"config_nominatim_email" varchar,
  	"config_nominatim_countrycodes" varchar,
  	"config_nominatim_addressdetails" boolean DEFAULT true,
  	"config_nominatim_extratags" boolean DEFAULT false,
  	"config_opencage_api_key" varchar,
  	"config_opencage_language" varchar DEFAULT 'en',
  	"config_opencage_countrycode" varchar,
  	"config_opencage_bounds_enabled" boolean DEFAULT false,
  	"config_opencage_bounds_southwest_lat" numeric,
  	"config_opencage_bounds_southwest_lng" numeric,
  	"config_opencage_bounds_northeast_lat" numeric,
  	"config_opencage_bounds_northeast_lng" numeric,
  	"config_opencage_annotations" boolean DEFAULT true,
  	"config_opencage_abbrv" boolean DEFAULT false,
  	"statistics_total_requests" numeric DEFAULT 0,
  	"statistics_successful_requests" numeric DEFAULT 0,
  	"statistics_failed_requests" numeric DEFAULT 0,
  	"statistics_last_used" timestamp(3) with time zone,
  	"statistics_average_response_time" numeric,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "payload"."enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "payload"."enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );

  CREATE TABLE "payload"."payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "payload"."enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"catalogs_id" integer,
  	"datasets_id" integer,
  	"imports_id" integer,
  	"events_id" integer,
  	"users_id" integer,
  	"media_id" integer,
  	"location_cache_id" integer,
  	"geocoding_providers_id" integer,
  	"pages_id" integer,
  	"payload_jobs_id" integer
  );

  CREATE TABLE "payload"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );

  CREATE TABLE "payload"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."main_menu_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );

  CREATE TABLE "payload"."main_menu" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  ALTER TABLE "payload"."datasets" ADD CONSTRAINT "datasets_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."imports_job_history" ADD CONSTRAINT "imports_job_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."imports" ADD CONSTRAINT "imports_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."events" ADD CONSTRAINT "events_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."events" ADD CONSTRAINT "events_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "payload"."imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."geocoding_providers_tags" ADD CONSTRAINT "geocoding_providers_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."geocoding_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_catalogs_fk" FOREIGN KEY ("catalogs_id") REFERENCES "payload"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_imports_fk" FOREIGN KEY ("imports_id") REFERENCES "payload"."imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "payload"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_location_cache_fk" FOREIGN KEY ("location_cache_id") REFERENCES "payload"."location_cache"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_geocoding_providers_fk" FOREIGN KEY ("geocoding_providers_id") REFERENCES "payload"."geocoding_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_jobs_fk" FOREIGN KEY ("payload_jobs_id") REFERENCES "payload"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."main_menu_nav_items" ADD CONSTRAINT "main_menu_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."main_menu"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "catalogs_slug_idx" ON "payload"."catalogs" USING btree ("slug");
  CREATE INDEX "catalogs_updated_at_idx" ON "payload"."catalogs" USING btree ("updated_at");
  CREATE INDEX "catalogs_created_at_idx" ON "payload"."catalogs" USING btree ("created_at");
  CREATE UNIQUE INDEX "datasets_slug_idx" ON "payload"."datasets" USING btree ("slug");
  CREATE INDEX "datasets_catalog_idx" ON "payload"."datasets" USING btree ("catalog_id");
  CREATE INDEX "datasets_updated_at_idx" ON "payload"."datasets" USING btree ("updated_at");
  CREATE INDEX "datasets_created_at_idx" ON "payload"."datasets" USING btree ("created_at");
  CREATE INDEX "imports_job_history_order_idx" ON "payload"."imports_job_history" USING btree ("_order");
  CREATE INDEX "imports_job_history_parent_id_idx" ON "payload"."imports_job_history" USING btree ("_parent_id");
  CREATE INDEX "imports_catalog_idx" ON "payload"."imports" USING btree ("catalog_id");
  CREATE INDEX "imports_user_idx" ON "payload"."imports" USING btree ("user_id");
  CREATE INDEX "imports_updated_at_idx" ON "payload"."imports" USING btree ("updated_at");
  CREATE INDEX "imports_created_at_idx" ON "payload"."imports" USING btree ("created_at");
  CREATE INDEX "events_dataset_idx" ON "payload"."events" USING btree ("dataset_id");
  CREATE INDEX "events_import_idx" ON "payload"."events" USING btree ("import_id");
  CREATE UNIQUE INDEX "events_slug_idx" ON "payload"."events" USING btree ("slug");
  CREATE INDEX "events_updated_at_idx" ON "payload"."events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "payload"."events" USING btree ("created_at");
  CREATE INDEX "dataset_eventTimestamp_idx" ON "payload"."events" USING btree ("dataset_id","event_timestamp");
  CREATE INDEX "eventTimestamp_idx" ON "payload"."events" USING btree ("event_timestamp");
  CREATE INDEX "users_sessions_order_idx" ON "payload"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "payload"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "payload"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "payload"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "payload"."users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "payload"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "payload"."media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "payload"."media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "payload"."media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "payload"."media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_tablet_sizes_tablet_filename_idx" ON "payload"."media" USING btree ("sizes_tablet_filename");
  CREATE UNIQUE INDEX "location_cache_original_address_idx" ON "payload"."location_cache" USING btree ("original_address");
  CREATE INDEX "location_cache_normalized_address_idx" ON "payload"."location_cache" USING btree ("normalized_address");
  CREATE INDEX "location_cache_updated_at_idx" ON "payload"."location_cache" USING btree ("updated_at");
  CREATE INDEX "location_cache_created_at_idx" ON "payload"."location_cache" USING btree ("created_at");
  CREATE INDEX "geocoding_providers_tags_order_idx" ON "payload"."geocoding_providers_tags" USING btree ("order");
  CREATE INDEX "geocoding_providers_tags_parent_idx" ON "payload"."geocoding_providers_tags" USING btree ("parent_id");
  CREATE UNIQUE INDEX "geocoding_providers_name_idx" ON "payload"."geocoding_providers" USING btree ("name");
  CREATE INDEX "geocoding_providers_updated_at_idx" ON "payload"."geocoding_providers" USING btree ("updated_at");
  CREATE INDEX "geocoding_providers_created_at_idx" ON "payload"."geocoding_providers" USING btree ("created_at");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "payload"."pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "payload"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "payload"."pages" USING btree ("created_at");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload"."payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload"."payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload"."payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload"."payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload"."payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload"."payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload"."payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload"."payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload"."payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload"."payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload"."payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_catalogs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("catalogs_id");
  CREATE INDEX "payload_locked_documents_rels_datasets_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("datasets_id");
  CREATE INDEX "payload_locked_documents_rels_imports_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("imports_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_location_cache_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("location_cache_id");
  CREATE INDEX "payload_locked_documents_rels_geocoding_providers_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("geocoding_providers_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_payload_jobs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("payload_jobs_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload"."payload_migrations" USING btree ("created_at");
  CREATE INDEX "main_menu_nav_items_order_idx" ON "payload"."main_menu_nav_items" USING btree ("_order");
  CREATE INDEX "main_menu_nav_items_parent_id_idx" ON "payload"."main_menu_nav_items" USING btree ("_parent_id");`);
};

export const down = async ({ db }: MigrateDownArgs): Promise<void> => {
  await db.execute(sql`
   DROP TABLE "payload"."catalogs" CASCADE;
  DROP TABLE "payload"."datasets" CASCADE;
  DROP TABLE "payload"."imports_job_history" CASCADE;
  DROP TABLE "payload"."imports" CASCADE;
  DROP TABLE "payload"."events" CASCADE;
  DROP TABLE "payload"."users_sessions" CASCADE;
  DROP TABLE "payload"."users" CASCADE;
  DROP TABLE "payload"."media" CASCADE;
  DROP TABLE "payload"."location_cache" CASCADE;
  DROP TABLE "payload"."geocoding_providers_tags" CASCADE;
  DROP TABLE "payload"."geocoding_providers" CASCADE;
  DROP TABLE "payload"."pages" CASCADE;
  DROP TABLE "payload"."payload_jobs_log" CASCADE;
  DROP TABLE "payload"."payload_jobs" CASCADE;
  DROP TABLE "payload"."payload_locked_documents" CASCADE;
  DROP TABLE "payload"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload"."payload_preferences" CASCADE;
  DROP TABLE "payload"."payload_preferences_rels" CASCADE;
  DROP TABLE "payload"."payload_migrations" CASCADE;
  DROP TABLE "payload"."main_menu_nav_items" CASCADE;
  DROP TABLE "payload"."main_menu" CASCADE;
  DROP TYPE "payload"."enum_catalogs_status";
  DROP TYPE "payload"."enum_datasets_status";
  DROP TYPE "payload"."enum_imports_job_history_job_type";
  DROP TYPE "payload"."enum_imports_job_history_status";
  DROP TYPE "payload"."enum_imports_status";
  DROP TYPE "payload"."enum_imports_processing_stage";
  DROP TYPE "payload"."enum_imports_coordinate_detection_detection_method";
  DROP TYPE "payload"."coord_fmt";
  DROP TYPE "payload"."enum_events_coordinate_source_type";
  DROP TYPE "payload"."enum_events_coordinate_source_validation_status";
  DROP TYPE "payload"."enum_events_geocoding_info_provider";
  DROP TYPE "payload"."enum_users_role";
  DROP TYPE "payload"."enum_geocoding_providers_tags";
  DROP TYPE "payload"."enum_geocoding_providers_type";
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  DROP TYPE "payload"."enum_payload_jobs_log_state";
  DROP TYPE "payload"."enum_payload_jobs_task_slug";`);
};
