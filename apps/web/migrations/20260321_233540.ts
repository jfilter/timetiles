import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."_locales" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_catalogs_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__catalogs_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__catalogs_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_data_exports_status" AS ENUM('pending', 'processing', 'ready', 'failed', 'expired');
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split');
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_input_format" AS ENUM('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY');
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_output_format" AS ENUM('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY');
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_operation" AS ENUM('uppercase', 'lowercase', 'trim', 'replace', 'expression');
  CREATE TYPE "payload"."enum_datasets_id_strategy_type" AS ENUM('external', 'computed', 'auto', 'hybrid');
  CREATE TYPE "payload"."enum_datasets_id_strategy_duplicate_strategy" AS ENUM('skip', 'update', 'version');
  CREATE TYPE "payload"."enum_datasets_schema_config_enum_mode" AS ENUM('count', 'percentage');
  CREATE TYPE "payload"."enum_datasets_deduplication_config_strategy" AS ENUM('skip', 'update', 'version');
  CREATE TYPE "payload"."enum_datasets_enum_detection_mode" AS ENUM('count', 'percentage', 'disabled');
  CREATE TYPE "payload"."enum_datasets_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split');
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format" AS ENUM('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY');
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_output_format" AS ENUM('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY');
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_operation" AS ENUM('uppercase', 'lowercase', 'trim', 'replace', 'expression');
  CREATE TYPE "payload"."enum__datasets_v_version_id_strategy_type" AS ENUM('external', 'computed', 'auto', 'hybrid');
  CREATE TYPE "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy" AS ENUM('skip', 'update', 'version');
  CREATE TYPE "payload"."enum__datasets_v_version_schema_config_enum_mode" AS ENUM('count', 'percentage');
  CREATE TYPE "payload"."enum__datasets_v_version_deduplication_config_strategy" AS ENUM('skip', 'update', 'version');
  CREATE TYPE "payload"."enum__datasets_v_version_enum_detection_mode" AS ENUM('count', 'percentage', 'disabled');
  CREATE TYPE "payload"."enum__datasets_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__datasets_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_dataset_schemas_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__dataset_schemas_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__dataset_schemas_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_ingest_files_status" AS ENUM('pending', 'parsing', 'processing', 'completed', 'failed');
  CREATE TYPE "payload"."enum__ingest_files_v_version_status" AS ENUM('pending', 'parsing', 'processing', 'completed', 'failed');
  CREATE TYPE "payload"."enum_ingest_jobs_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  CREATE TYPE "payload"."enum_ingest_jobs_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events');
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events');
  CREATE TYPE "payload"."enum_scheduled_ingests_execution_history_status" AS ENUM('success', 'failed');
  CREATE TYPE "payload"."trig_by" AS ENUM('schedule', 'webhook', 'manual', 'system');
  CREATE TYPE "payload"."enum_scheduled_ingests_schedule_type" AS ENUM('frequency', 'cron');
  CREATE TYPE "payload"."enum_scheduled_ingests_frequency" AS ENUM('hourly', 'daily', 'weekly', 'monthly');
  CREATE TYPE "payload"."enum_scheduled_ingests_schema_mode" AS ENUM('strict', 'additive', 'flexible');
  CREATE TYPE "payload"."enum_scheduled_ingests_auth_config_type" AS ENUM('none', 'api-key', 'bearer', 'basic');
  CREATE TYPE "payload"."si_response_format" AS ENUM('auto', 'csv', 'json');
  CREATE TYPE "payload"."si_json_paging_type" AS ENUM('offset', 'cursor', 'page');
  CREATE TYPE "payload"."enum_scheduled_ingests_last_status" AS ENUM('success', 'failed', 'running');
  CREATE TYPE "payload"."enum_scheduled_ingests_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_execution_history_status" AS ENUM('success', 'failed');
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_schedule_type" AS ENUM('frequency', 'cron');
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_frequency" AS ENUM('hourly', 'daily', 'weekly', 'monthly');
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_schema_mode" AS ENUM('strict', 'additive', 'flexible');
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_auth_config_type" AS ENUM('none', 'api-key', 'bearer', 'basic');
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_last_status" AS ENUM('success', 'failed', 'running');
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__scheduled_ingests_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_scraper_repos_source_type" AS ENUM('git', 'upload');
  CREATE TYPE "payload"."enum_scraper_repos_last_sync_status" AS ENUM('success', 'failed');
  CREATE TYPE "payload"."enum_scrapers_runtime" AS ENUM('python', 'node');
  CREATE TYPE "payload"."enum_scrapers_last_run_status" AS ENUM('success', 'failed', 'timeout', 'running');
  CREATE TYPE "payload"."enum_scraper_runs_status" AS ENUM('queued', 'running', 'success', 'failed', 'timeout');
  CREATE TYPE "payload"."enum_scraper_runs_triggered_by" AS ENUM('schedule', 'manual', 'webhook');
  CREATE TYPE "payload"."enum_events_coordinate_source_type" AS ENUM('source-data', 'geocoded', 'manual', 'none');
  CREATE TYPE "payload"."enum_events_coordinate_source_validation_status" AS ENUM('valid', 'out_of_range', 'suspicious_zero', 'swapped', 'invalid');
  CREATE TYPE "payload"."enum_events_geocoding_info_geocoding_status" AS ENUM('pending', 'success', 'failed');
  CREATE TYPE "payload"."enum_events_geocoding_info_provider" AS ENUM('google', 'nominatim', 'manual');
  CREATE TYPE "payload"."enum_events_validation_status" AS ENUM('pending', 'valid', 'invalid', 'transformed');
  CREATE TYPE "payload"."enum_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__events_v_version_coordinate_source_type" AS ENUM('source-data', 'geocoded', 'manual', 'none');
  CREATE TYPE "payload"."enum__events_v_version_coordinate_source_validation_status" AS ENUM('valid', 'out_of_range', 'suspicious_zero', 'swapped', 'invalid');
  CREATE TYPE "payload"."enum__events_v_version_geocoding_info_geocoding_status" AS ENUM('pending', 'success', 'failed');
  CREATE TYPE "payload"."enum__events_v_version_geocoding_info_provider" AS ENUM('google', 'nominatim', 'manual');
  CREATE TYPE "payload"."enum__events_v_version_validation_status" AS ENUM('pending', 'valid', 'invalid', 'transformed');
  CREATE TYPE "payload"."enum__events_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__events_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_users_role" AS ENUM('user', 'admin', 'editor');
  CREATE TYPE "payload"."enum_users_registration_source" AS ENUM('admin', 'self');
  CREATE TYPE "payload"."enum_users_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_users_trust_level" AS ENUM('0', '1', '2', '3', '4', '5');
  CREATE TYPE "payload"."enum_users_deletion_status" AS ENUM('active', 'pending_deletion', 'deleted');
  CREATE TYPE "payload"."enum_media_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__media_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__media_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_location_cache_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__location_cache_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__location_cache_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_geocoding_providers_tags" AS ENUM('production', 'development', 'testing', 'backup', 'primary', 'secondary', 'region-us', 'region-eu', 'region-asia', 'region-global', 'high-volume', 'low-volume', 'free-tier', 'paid-tier');
  CREATE TYPE "payload"."enum_geocoding_providers_type" AS ENUM('google', 'nominatim', 'opencage');
  CREATE TYPE "payload"."enum_geocoding_providers_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__geocoding_providers_v_version_tags" AS ENUM('production', 'development', 'testing', 'backup', 'primary', 'secondary', 'region-us', 'region-eu', 'region-asia', 'region-global', 'high-volume', 'low-volume', 'free-tier', 'paid-tier');
  CREATE TYPE "payload"."enum__geocoding_providers_v_version_type" AS ENUM('google', 'nominatim', 'opencage');
  CREATE TYPE "payload"."enum__geocoding_providers_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__geocoding_providers_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_pages_blocks_hero_buttons_variant" AS ENUM('default', 'outline');
  CREATE TYPE "payload"."enum_pages_blocks_hero_background" AS ENUM('gradient', 'grid');
  CREATE TYPE "payload"."pt" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."pb" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."mw" AS ENUM('sm', 'md', 'lg', 'xl', 'full');
  CREATE TYPE "payload"."sep" AS ENUM('none', 'line', 'gradient', 'wave');
  CREATE TYPE "payload"."enum_pages_blocks_features_features_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum_pages_blocks_features_features_accent" AS ENUM('none', 'primary', 'secondary', 'accent', 'muted');
  CREATE TYPE "payload"."enum_pages_blocks_features_columns" AS ENUM('1', '2', '3', '4');
  CREATE TYPE "payload"."enum_pages_blocks_stats_stats_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum_pages_blocks_details_grid_items_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum_pages_blocks_details_grid_variant" AS ENUM('grid-2', 'grid-3', 'grid-4', 'compact');
  CREATE TYPE "payload"."enum_pages_blocks_timeline_variant" AS ENUM('vertical', 'compact');
  CREATE TYPE "payload"."enum_pages_blocks_testimonials_items_avatar" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum_pages_blocks_testimonials_variant" AS ENUM('grid', 'single', 'masonry');
  CREATE TYPE "payload"."enum_pages_blocks_newsletter_c_t_a_variant" AS ENUM('default', 'elevated', 'centered');
  CREATE TYPE "payload"."enum_pages_blocks_newsletter_c_t_a_size" AS ENUM('default', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_buttons_variant" AS ENUM('default', 'outline');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_background" AS ENUM('gradient', 'grid');
  CREATE TYPE "payload"."enum__pages_v_blocks_features_features_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum__pages_v_blocks_features_features_accent" AS ENUM('none', 'primary', 'secondary', 'accent', 'muted');
  CREATE TYPE "payload"."enum__pages_v_blocks_features_columns" AS ENUM('1', '2', '3', '4');
  CREATE TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum__pages_v_blocks_details_grid_items_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum__pages_v_blocks_details_grid_variant" AS ENUM('grid-2', 'grid-3', 'grid-4', 'compact');
  CREATE TYPE "payload"."enum__pages_v_blocks_timeline_variant" AS ENUM('vertical', 'compact');
  CREATE TYPE "payload"."enum__pages_v_blocks_testimonials_items_avatar" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum__pages_v_blocks_testimonials_variant" AS ENUM('grid', 'single', 'masonry');
  CREATE TYPE "payload"."enum__pages_v_blocks_newsletter_c_t_a_variant" AS ENUM('default', 'elevated', 'centered');
  CREATE TYPE "payload"."enum__pages_v_blocks_newsletter_c_t_a_size" AS ENUM('default', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__pages_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_sites_branding_typography_font_pairing" AS ENUM('editorial', 'modern', 'monospace');
  CREATE TYPE "payload"."enum_sites_branding_style_border_radius" AS ENUM('sharp', 'rounded', 'pill');
  CREATE TYPE "payload"."enum_sites_branding_style_density" AS ENUM('compact', 'default', 'comfortable');
  CREATE TYPE "payload"."enum_sites_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__sites_v_version_branding_typography_font_pairing" AS ENUM('editorial', 'modern', 'monospace');
  CREATE TYPE "payload"."enum__sites_v_version_branding_style_border_radius" AS ENUM('sharp', 'rounded', 'pill');
  CREATE TYPE "payload"."enum__sites_v_version_branding_style_density" AS ENUM('compact', 'default', 'comfortable');
  CREATE TYPE "payload"."enum__sites_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__sites_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_themes_typography_font_pairing" AS ENUM('editorial', 'modern', 'monospace');
  CREATE TYPE "payload"."enum_themes_style_border_radius" AS ENUM('sharp', 'rounded', 'pill');
  CREATE TYPE "payload"."enum_themes_style_density" AS ENUM('compact', 'default', 'comfortable');
  CREATE TYPE "payload"."enum_themes_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__themes_v_version_typography_font_pairing" AS ENUM('editorial', 'modern', 'monospace');
  CREATE TYPE "payload"."enum__themes_v_version_style_border_radius" AS ENUM('sharp', 'rounded', 'pill');
  CREATE TYPE "payload"."enum__themes_v_version_style_density" AS ENUM('compact', 'default', 'comfortable');
  CREATE TYPE "payload"."enum__themes_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__themes_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_layout_templates_header_variant" AS ENUM('marketing', 'app', 'minimal', 'none');
  CREATE TYPE "payload"."enum_layout_templates_footer_variant" AS ENUM('full', 'compact', 'none');
  CREATE TYPE "payload"."enum_layout_templates_content_max_width" AS ENUM('sm', 'md', 'lg', 'xl', 'full');
  CREATE TYPE "payload"."enum_layout_templates_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__layout_templates_v_version_header_variant" AS ENUM('marketing', 'app', 'minimal', 'none');
  CREATE TYPE "payload"."enum__layout_templates_v_version_footer_variant" AS ENUM('full', 'compact', 'none');
  CREATE TYPE "payload"."enum__layout_templates_v_version_content_max_width" AS ENUM('sm', 'md', 'lg', 'xl', 'full');
  CREATE TYPE "payload"."enum__layout_templates_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__layout_templates_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_views_data_scope_mode" AS ENUM('all', 'catalogs', 'datasets');
  CREATE TYPE "payload"."enum_views_filter_config_mode" AS ENUM('auto', 'manual', 'disabled');
  CREATE TYPE "payload"."enum_views_map_settings_base_map_style" AS ENUM('default', 'light', 'dark', 'satellite');
  CREATE TYPE "payload"."enum_views_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__views_v_version_data_scope_mode" AS ENUM('all', 'catalogs', 'datasets');
  CREATE TYPE "payload"."enum__views_v_version_filter_config_mode" AS ENUM('auto', 'manual', 'disabled');
  CREATE TYPE "payload"."enum__views_v_version_map_settings_base_map_style" AS ENUM('default', 'light', 'dark', 'satellite');
  CREATE TYPE "payload"."enum__views_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__views_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  CREATE TYPE "payload"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  CREATE TYPE "payload"."enum_main_menu_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__main_menu_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__main_menu_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_footer_social_links_platform" AS ENUM('x', 'bluesky', 'mastodon', 'github', 'linkedin', 'facebook', 'instagram', 'youtube');
  CREATE TYPE "payload"."enum_footer_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__footer_v_version_social_links_platform" AS ENUM('x', 'bluesky', 'mastodon', 'github', 'linkedin', 'facebook', 'instagram', 'youtube');
  CREATE TYPE "payload"."enum__footer_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__footer_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum_settings_geocoding_provider_selection_required_tags" AS ENUM('production', 'development', 'testing', 'primary', 'secondary', 'backup');
  CREATE TYPE "payload"."enum_settings_geocoding_provider_selection_strategy" AS ENUM('priority', 'tag-based');
  CREATE TABLE "payload"."catalogs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" jsonb,
  	"slug" varchar,
  	"created_by_id" integer,
  	"is_public" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_catalogs_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_catalogs_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_description" jsonb,
  	"version_slug" varchar,
  	"version_created_by_id" integer,
  	"version_is_public" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__catalogs_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__catalogs_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."data_exports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"status" "payload"."enum_data_exports_status" DEFAULT 'pending' NOT NULL,
  	"requested_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone,
  	"file_path" varchar,
  	"file_size" numeric,
  	"download_count" numeric DEFAULT 0,
  	"summary" jsonb,
  	"error_log" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."datasets_id_strategy_computed_id_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field_path" varchar
  );
  
  CREATE TABLE "payload"."datasets_ingest_transforms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "payload"."enum_datasets_ingest_transforms_type" DEFAULT 'rename',
  	"from" varchar,
  	"to" varchar,
  	"input_format" "payload"."enum_datasets_ingest_transforms_input_format",
  	"output_format" "payload"."enum_datasets_ingest_transforms_output_format" DEFAULT 'YYYY-MM-DD',
  	"timezone" varchar,
  	"operation" "payload"."enum_datasets_ingest_transforms_operation",
  	"pattern" varchar,
  	"replacement" varchar,
  	"expression" varchar,
  	"from_fields" jsonb,
  	"separator" varchar DEFAULT ' ',
  	"delimiter" varchar DEFAULT ',',
  	"to_fields" jsonb,
  	"active" boolean DEFAULT true,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer,
  	"confidence" numeric,
  	"auto_detected" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."datasets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" jsonb,
  	"slug" varchar,
  	"catalog_id" integer,
  	"catalog_creator_id" numeric,
  	"catalog_is_public" boolean DEFAULT false,
  	"language" varchar,
  	"is_public" boolean DEFAULT false,
  	"created_by_id" integer,
  	"metadata" jsonb,
  	"id_strategy_type" "payload"."enum_datasets_id_strategy_type" DEFAULT 'auto',
  	"id_strategy_external_id_path" varchar,
  	"id_strategy_duplicate_strategy" "payload"."enum_datasets_id_strategy_duplicate_strategy" DEFAULT 'skip',
  	"schema_config_enabled" boolean DEFAULT false,
  	"schema_config_locked" boolean DEFAULT false,
  	"schema_config_auto_grow" boolean DEFAULT true,
  	"schema_config_auto_approve_non_breaking" boolean DEFAULT false,
  	"schema_config_strict_validation" boolean DEFAULT false,
  	"schema_config_allow_transformations" boolean DEFAULT true,
  	"schema_config_max_schema_depth" numeric DEFAULT 3,
  	"schema_config_enum_threshold" numeric DEFAULT 50,
  	"schema_config_enum_mode" "payload"."enum_datasets_schema_config_enum_mode" DEFAULT 'count',
  	"deduplication_config_enabled" boolean DEFAULT true,
  	"deduplication_config_strategy" "payload"."enum_datasets_deduplication_config_strategy" DEFAULT 'skip',
  	"field_metadata" jsonb,
  	"enum_detection_mode" "payload"."enum_datasets_enum_detection_mode" DEFAULT 'count',
  	"enum_detection_threshold" numeric DEFAULT 50,
  	"geo_field_detection_auto_detect" boolean DEFAULT true,
  	"geo_field_detection_latitude_path" varchar,
  	"geo_field_detection_longitude_path" varchar,
  	"field_mapping_overrides_title_path" varchar,
  	"field_mapping_overrides_description_path" varchar,
  	"field_mapping_overrides_location_name_path" varchar,
  	"field_mapping_overrides_timestamp_path" varchar,
  	"field_mapping_overrides_latitude_path" varchar,
  	"field_mapping_overrides_longitude_path" varchar,
  	"field_mapping_overrides_location_path" varchar,
  	"schema_detector_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_datasets_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_datasets_v_version_id_strategy_computed_id_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_datasets_v_version_ingest_transforms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"type" "payload"."enum__datasets_v_version_ingest_transforms_type" DEFAULT 'rename',
  	"from" varchar,
  	"to" varchar,
  	"input_format" "payload"."enum__datasets_v_version_ingest_transforms_input_format",
  	"output_format" "payload"."enum__datasets_v_version_ingest_transforms_output_format" DEFAULT 'YYYY-MM-DD',
  	"timezone" varchar,
  	"operation" "payload"."enum__datasets_v_version_ingest_transforms_operation",
  	"pattern" varchar,
  	"replacement" varchar,
  	"expression" varchar,
  	"from_fields" jsonb,
  	"separator" varchar DEFAULT ' ',
  	"delimiter" varchar DEFAULT ',',
  	"to_fields" jsonb,
  	"active" boolean DEFAULT true,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer,
  	"confidence" numeric,
  	"auto_detected" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."_datasets_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_description" jsonb,
  	"version_slug" varchar,
  	"version_catalog_id" integer,
  	"version_catalog_creator_id" numeric,
  	"version_catalog_is_public" boolean DEFAULT false,
  	"version_language" varchar,
  	"version_is_public" boolean DEFAULT false,
  	"version_created_by_id" integer,
  	"version_metadata" jsonb,
  	"version_id_strategy_type" "payload"."enum__datasets_v_version_id_strategy_type" DEFAULT 'auto',
  	"version_id_strategy_external_id_path" varchar,
  	"version_id_strategy_duplicate_strategy" "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy" DEFAULT 'skip',
  	"version_schema_config_enabled" boolean DEFAULT false,
  	"version_schema_config_locked" boolean DEFAULT false,
  	"version_schema_config_auto_grow" boolean DEFAULT true,
  	"version_schema_config_auto_approve_non_breaking" boolean DEFAULT false,
  	"version_schema_config_strict_validation" boolean DEFAULT false,
  	"version_schema_config_allow_transformations" boolean DEFAULT true,
  	"version_schema_config_max_schema_depth" numeric DEFAULT 3,
  	"version_schema_config_enum_threshold" numeric DEFAULT 50,
  	"version_schema_config_enum_mode" "payload"."enum__datasets_v_version_schema_config_enum_mode" DEFAULT 'count',
  	"version_deduplication_config_enabled" boolean DEFAULT true,
  	"version_deduplication_config_strategy" "payload"."enum__datasets_v_version_deduplication_config_strategy" DEFAULT 'skip',
  	"version_field_metadata" jsonb,
  	"version_enum_detection_mode" "payload"."enum__datasets_v_version_enum_detection_mode" DEFAULT 'count',
  	"version_enum_detection_threshold" numeric DEFAULT 50,
  	"version_geo_field_detection_auto_detect" boolean DEFAULT true,
  	"version_geo_field_detection_latitude_path" varchar,
  	"version_geo_field_detection_longitude_path" varchar,
  	"version_field_mapping_overrides_title_path" varchar,
  	"version_field_mapping_overrides_description_path" varchar,
  	"version_field_mapping_overrides_location_name_path" varchar,
  	"version_field_mapping_overrides_timestamp_path" varchar,
  	"version_field_mapping_overrides_latitude_path" varchar,
  	"version_field_mapping_overrides_longitude_path" varchar,
  	"version_field_mapping_overrides_location_path" varchar,
  	"version_schema_detector_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__datasets_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__datasets_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."dataset_schemas_schema_summary_new_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );
  
  CREATE TABLE "payload"."dataset_schemas_schema_summary_removed_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );
  
  CREATE TABLE "payload"."dataset_schemas_schema_summary_type_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"old_type" varchar,
  	"new_type" varchar
  );
  
  CREATE TABLE "payload"."dataset_schemas_schema_summary_enum_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"added_values" jsonb,
  	"removed_values" jsonb
  );
  
  CREATE TABLE "payload"."dataset_schemas_ingest_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"ingest_job_id" integer,
  	"record_count" numeric,
  	"batch_count" numeric
  );
  
  CREATE TABLE "payload"."dataset_schemas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"dataset_id" integer,
  	"dataset_is_public" boolean DEFAULT false,
  	"catalog_owner_id" numeric,
  	"version_number" numeric,
  	"display_name" varchar,
  	"schema" jsonb,
  	"field_metadata" jsonb,
  	"event_count_at_creation" numeric,
  	"schema_summary_total_fields" numeric,
  	"approval_required" boolean,
  	"approved_by_id" integer,
  	"approval_notes" varchar,
  	"auto_approved" boolean,
  	"conflicts" jsonb,
  	"field_mappings_title_path" varchar,
  	"field_mappings_description_path" varchar,
  	"field_mappings_location_name_path" varchar,
  	"field_mappings_timestamp_path" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_dataset_schemas_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_dataset_schemas_v_version_schema_summary_new_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_dataset_schemas_v_version_schema_summary_type_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"old_type" varchar,
  	"new_type" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"added_values" jsonb,
  	"removed_values" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_dataset_schemas_v_version_ingest_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"ingest_job_id" integer,
  	"record_count" numeric,
  	"batch_count" numeric,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_dataset_schemas_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_dataset_id" integer,
  	"version_dataset_is_public" boolean DEFAULT false,
  	"version_catalog_owner_id" numeric,
  	"version_version_number" numeric,
  	"version_display_name" varchar,
  	"version_schema" jsonb,
  	"version_field_metadata" jsonb,
  	"version_event_count_at_creation" numeric,
  	"version_schema_summary_total_fields" numeric,
  	"version_approval_required" boolean,
  	"version_approved_by_id" integer,
  	"version_approval_notes" varchar,
  	"version_auto_approved" boolean,
  	"version_conflicts" jsonb,
  	"version_field_mappings_title_path" varchar,
  	"version_field_mappings_description_path" varchar,
  	"version_field_mappings_location_name_path" varchar,
  	"version_field_mappings_timestamp_path" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__dataset_schemas_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__dataset_schemas_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"action" varchar NOT NULL,
  	"user_id" numeric NOT NULL,
  	"user_email_hash" varchar NOT NULL,
  	"performed_by_id" integer,
  	"timestamp" timestamp(3) with time zone NOT NULL,
  	"ip_address" varchar,
  	"ip_address_hash" varchar,
  	"details" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."ingest_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"original_name" varchar,
  	"catalog_id" integer,
  	"user_id" integer NOT NULL,
  	"status" "payload"."enum_ingest_files_status" DEFAULT 'pending',
  	"datasets_count" numeric DEFAULT 0,
  	"datasets_processed" numeric DEFAULT 0,
  	"sheet_metadata" jsonb,
  	"job_id" varchar,
  	"uploaded_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"error_log" varchar,
  	"rate_limit_info" jsonb,
  	"metadata" jsonb,
  	"processing_options" jsonb,
  	"target_dataset_id" integer,
  	"scheduled_ingest_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "payload"."ingest_files_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"datasets_id" integer
  );
  
  CREATE TABLE "payload"."_ingest_files_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_original_name" varchar,
  	"version_catalog_id" integer,
  	"version_user_id" integer NOT NULL,
  	"version_status" "payload"."enum__ingest_files_v_version_status" DEFAULT 'pending',
  	"version_datasets_count" numeric DEFAULT 0,
  	"version_datasets_processed" numeric DEFAULT 0,
  	"version_sheet_metadata" jsonb,
  	"version_job_id" varchar,
  	"version_uploaded_at" timestamp(3) with time zone,
  	"version_completed_at" timestamp(3) with time zone,
  	"version_error_log" varchar,
  	"version_rate_limit_info" jsonb,
  	"version_metadata" jsonb,
  	"version_processing_options" jsonb,
  	"version_target_dataset_id" integer,
  	"version_scheduled_ingest_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version_url" varchar,
  	"version_thumbnail_u_r_l" varchar,
  	"version_filename" varchar,
  	"version_mime_type" varchar,
  	"version_filesize" numeric,
  	"version_width" numeric,
  	"version_height" numeric,
  	"version_focal_x" numeric,
  	"version_focal_y" numeric,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."_ingest_files_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"datasets_id" integer
  );
  
  CREATE TABLE "payload"."ingest_jobs_errors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"row" numeric,
  	"error" varchar
  );
  
  CREATE TABLE "payload"."ingest_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ingest_file_id" integer NOT NULL,
  	"dataset_id" integer NOT NULL,
  	"sheet_index" numeric,
  	"stage" "payload"."enum_ingest_jobs_stage" DEFAULT 'analyze-duplicates' NOT NULL,
  	"progress_stages" jsonb,
  	"progress_overall_percentage" numeric DEFAULT 0,
  	"progress_estimated_completion_time" timestamp(3) with time zone,
  	"schema" jsonb,
  	"schema_builder_state" jsonb,
  	"detected_field_mappings_title_path" varchar,
  	"detected_field_mappings_description_path" varchar,
  	"detected_field_mappings_location_name_path" varchar,
  	"detected_field_mappings_timestamp_path" varchar,
  	"detected_field_mappings_latitude_path" varchar,
  	"detected_field_mappings_longitude_path" varchar,
  	"detected_field_mappings_location_path" varchar,
  	"config_snapshot" jsonb,
  	"schema_validation_is_compatible" boolean,
  	"schema_validation_breaking_changes" jsonb,
  	"schema_validation_new_fields" jsonb,
  	"schema_validation_transform_suggestions" jsonb,
  	"schema_validation_requires_approval" boolean,
  	"schema_validation_approval_reason" varchar,
  	"schema_validation_approved" boolean,
  	"schema_validation_approved_by_id" integer,
  	"schema_validation_approved_at" timestamp(3) with time zone,
  	"dataset_schema_version_id" integer,
  	"duplicates_strategy" varchar,
  	"duplicates_internal" jsonb,
  	"duplicates_external" jsonb,
  	"duplicates_summary_total_rows" numeric,
  	"duplicates_summary_unique_rows" numeric,
  	"duplicates_summary_internal_duplicates" numeric,
  	"duplicates_summary_external_duplicates" numeric,
  	"geocoding_results" jsonb,
  	"results" jsonb,
  	"error_log" jsonb,
  	"retry_attempts" numeric DEFAULT 0,
  	"last_retry_at" timestamp(3) with time zone,
  	"next_retry_at" timestamp(3) with time zone,
  	"last_successful_stage" "payload"."enum_ingest_jobs_last_successful_stage",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."_ingest_jobs_v_version_errors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"row" numeric,
  	"error" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_ingest_jobs_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_ingest_file_id" integer NOT NULL,
  	"version_dataset_id" integer NOT NULL,
  	"version_sheet_index" numeric,
  	"version_stage" "payload"."enum__ingest_jobs_v_version_stage" DEFAULT 'analyze-duplicates' NOT NULL,
  	"version_progress_stages" jsonb,
  	"version_progress_overall_percentage" numeric DEFAULT 0,
  	"version_progress_estimated_completion_time" timestamp(3) with time zone,
  	"version_schema" jsonb,
  	"version_schema_builder_state" jsonb,
  	"version_detected_field_mappings_title_path" varchar,
  	"version_detected_field_mappings_description_path" varchar,
  	"version_detected_field_mappings_location_name_path" varchar,
  	"version_detected_field_mappings_timestamp_path" varchar,
  	"version_detected_field_mappings_latitude_path" varchar,
  	"version_detected_field_mappings_longitude_path" varchar,
  	"version_detected_field_mappings_location_path" varchar,
  	"version_config_snapshot" jsonb,
  	"version_schema_validation_is_compatible" boolean,
  	"version_schema_validation_breaking_changes" jsonb,
  	"version_schema_validation_new_fields" jsonb,
  	"version_schema_validation_transform_suggestions" jsonb,
  	"version_schema_validation_requires_approval" boolean,
  	"version_schema_validation_approval_reason" varchar,
  	"version_schema_validation_approved" boolean,
  	"version_schema_validation_approved_by_id" integer,
  	"version_schema_validation_approved_at" timestamp(3) with time zone,
  	"version_dataset_schema_version_id" integer,
  	"version_duplicates_strategy" varchar,
  	"version_duplicates_internal" jsonb,
  	"version_duplicates_external" jsonb,
  	"version_duplicates_summary_total_rows" numeric,
  	"version_duplicates_summary_unique_rows" numeric,
  	"version_duplicates_summary_internal_duplicates" numeric,
  	"version_duplicates_summary_external_duplicates" numeric,
  	"version_geocoding_results" jsonb,
  	"version_results" jsonb,
  	"version_error_log" jsonb,
  	"version_retry_attempts" numeric DEFAULT 0,
  	"version_last_retry_at" timestamp(3) with time zone,
  	"version_next_retry_at" timestamp(3) with time zone,
  	"version_last_successful_stage" "payload"."enum__ingest_jobs_v_version_last_successful_stage",
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."scheduled_ingests_multi_sheet_config_sheets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sheet_identifier" varchar,
  	"dataset_id" integer,
  	"skip_if_missing" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."scheduled_ingests_execution_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone,
  	"status" "payload"."enum_scheduled_ingests_execution_history_status",
  	"duration" numeric,
  	"records_imported" numeric,
  	"error" varchar,
  	"job_id" varchar,
  	"triggered_by" "payload"."trig_by" DEFAULT 'schedule'
  );
  
  CREATE TABLE "payload"."scheduled_ingests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"created_by_id" integer,
  	"description" varchar,
  	"enabled" boolean DEFAULT true,
  	"source_url" varchar,
  	"catalog_id" integer,
  	"dataset_id" integer,
  	"multi_sheet_config_enabled" boolean DEFAULT false,
  	"schedule_type" "payload"."enum_scheduled_ingests_schedule_type" DEFAULT 'frequency',
  	"frequency" "payload"."enum_scheduled_ingests_frequency",
  	"cron_expression" varchar,
  	"timezone" varchar DEFAULT 'UTC',
  	"ingest_name_template" varchar DEFAULT '{{name}} - {{date}}',
  	"schema_mode" "payload"."enum_scheduled_ingests_schema_mode" DEFAULT 'additive',
  	"source_ingest_file_id" integer,
  	"auth_config_type" "payload"."enum_scheduled_ingests_auth_config_type" DEFAULT 'none',
  	"auth_config_api_key" varchar,
  	"auth_config_api_key_header" varchar DEFAULT 'X-API-Key',
  	"auth_config_bearer_token" varchar,
  	"auth_config_username" varchar,
  	"auth_config_password" varchar,
  	"auth_config_custom_headers" jsonb,
  	"retry_config_max_retries" numeric DEFAULT 3,
  	"retry_config_retry_delay_minutes" numeric DEFAULT 5,
  	"retry_config_exponential_backoff" boolean DEFAULT true,
  	"advanced_options_timeout_minutes" numeric DEFAULT 30,
  	"advanced_options_skip_duplicate_checking" boolean DEFAULT false,
  	"advanced_options_auto_approve_schema" boolean DEFAULT false,
  	"advanced_options_max_file_size_m_b" numeric,
  	"advanced_options_use_http_cache" boolean DEFAULT true,
  	"advanced_options_bypass_cache_on_manual" boolean DEFAULT false,
  	"advanced_options_respect_cache_control" boolean DEFAULT true,
  	"advanced_options_response_format" "payload"."si_response_format" DEFAULT 'auto',
  	"advanced_options_json_api_config_records_path" varchar,
  	"advanced_options_json_api_config_pagination_enabled" boolean DEFAULT false,
  	"advanced_options_json_api_config_pagination_type" "payload"."si_json_paging_type",
  	"advanced_options_json_api_config_pagination_page_param" varchar DEFAULT 'page',
  	"advanced_options_json_api_config_pagination_limit_param" varchar DEFAULT 'limit',
  	"advanced_options_json_api_config_pagination_limit_value" numeric DEFAULT 100,
  	"advanced_options_json_api_config_pagination_cursor_param" varchar,
  	"advanced_options_json_api_config_pagination_next_cursor_path" varchar,
  	"advanced_options_json_api_config_pagination_total_path" varchar,
  	"advanced_options_json_api_config_pagination_max_pages" numeric DEFAULT 50,
  	"last_run" timestamp(3) with time zone,
  	"next_run" timestamp(3) with time zone,
  	"last_status" "payload"."enum_scheduled_ingests_last_status",
  	"last_error" varchar,
  	"current_retries" numeric DEFAULT 0,
  	"statistics_total_runs" numeric DEFAULT 0,
  	"statistics_successful_runs" numeric DEFAULT 0,
  	"statistics_failed_runs" numeric DEFAULT 0,
  	"statistics_average_duration" numeric DEFAULT 0,
  	"webhook_enabled" boolean DEFAULT false,
  	"webhook_token" varchar,
  	"webhook_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_scheduled_ingests_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_scheduled_ingests_v_version_multi_sheet_config_sheets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"sheet_identifier" varchar,
  	"dataset_id" integer,
  	"skip_if_missing" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_scheduled_ingests_v_version_execution_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone,
  	"status" "payload"."enum__scheduled_ingests_v_version_execution_history_status",
  	"duration" numeric,
  	"records_imported" numeric,
  	"error" varchar,
  	"job_id" varchar,
  	"triggered_by" "payload"."trig_by" DEFAULT 'schedule',
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_scheduled_ingests_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_created_by_id" integer,
  	"version_description" varchar,
  	"version_enabled" boolean DEFAULT true,
  	"version_source_url" varchar,
  	"version_catalog_id" integer,
  	"version_dataset_id" integer,
  	"version_multi_sheet_config_enabled" boolean DEFAULT false,
  	"version_schedule_type" "payload"."enum__scheduled_ingests_v_version_schedule_type" DEFAULT 'frequency',
  	"version_frequency" "payload"."enum__scheduled_ingests_v_version_frequency",
  	"version_cron_expression" varchar,
  	"version_timezone" varchar DEFAULT 'UTC',
  	"version_ingest_name_template" varchar DEFAULT '{{name}} - {{date}}',
  	"version_schema_mode" "payload"."enum__scheduled_ingests_v_version_schema_mode" DEFAULT 'additive',
  	"version_source_ingest_file_id" integer,
  	"version_auth_config_type" "payload"."enum__scheduled_ingests_v_version_auth_config_type" DEFAULT 'none',
  	"version_auth_config_api_key" varchar,
  	"version_auth_config_api_key_header" varchar DEFAULT 'X-API-Key',
  	"version_auth_config_bearer_token" varchar,
  	"version_auth_config_username" varchar,
  	"version_auth_config_password" varchar,
  	"version_auth_config_custom_headers" jsonb,
  	"version_retry_config_max_retries" numeric DEFAULT 3,
  	"version_retry_config_retry_delay_minutes" numeric DEFAULT 5,
  	"version_retry_config_exponential_backoff" boolean DEFAULT true,
  	"version_advanced_options_timeout_minutes" numeric DEFAULT 30,
  	"version_advanced_options_skip_duplicate_checking" boolean DEFAULT false,
  	"version_advanced_options_auto_approve_schema" boolean DEFAULT false,
  	"version_advanced_options_max_file_size_m_b" numeric,
  	"version_advanced_options_use_http_cache" boolean DEFAULT true,
  	"version_advanced_options_bypass_cache_on_manual" boolean DEFAULT false,
  	"version_advanced_options_respect_cache_control" boolean DEFAULT true,
  	"version_advanced_options_response_format" "payload"."si_response_format" DEFAULT 'auto',
  	"version_advanced_options_json_api_config_records_path" varchar,
  	"version_advanced_options_json_api_config_pagination_enabled" boolean DEFAULT false,
  	"version_advanced_options_json_api_config_pagination_type" "payload"."si_json_paging_type",
  	"version_advanced_options_json_api_config_pagination_page_param" varchar DEFAULT 'page',
  	"version_advanced_options_json_api_config_pagination_limit_param" varchar DEFAULT 'limit',
  	"version_advanced_options_json_api_config_pagination_limit_value" numeric DEFAULT 100,
  	"version_advanced_options_json_api_config_pagination_cursor_param" varchar,
  	"version_advanced_options_json_api_config_pagination_next_cursor_path" varchar,
  	"version_advanced_options_json_api_config_pagination_total_path" varchar,
  	"version_advanced_options_json_api_config_pagination_max_pages" numeric DEFAULT 50,
  	"version_last_run" timestamp(3) with time zone,
  	"version_next_run" timestamp(3) with time zone,
  	"version_last_status" "payload"."enum__scheduled_ingests_v_version_last_status",
  	"version_last_error" varchar,
  	"version_current_retries" numeric DEFAULT 0,
  	"version_statistics_total_runs" numeric DEFAULT 0,
  	"version_statistics_successful_runs" numeric DEFAULT 0,
  	"version_statistics_failed_runs" numeric DEFAULT 0,
  	"version_statistics_average_duration" numeric DEFAULT 0,
  	"version_webhook_enabled" boolean DEFAULT false,
  	"version_webhook_token" varchar,
  	"version_webhook_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__scheduled_ingests_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__scheduled_ingests_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."scraper_repos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" jsonb,
  	"slug" varchar,
  	"created_by_id" integer,
  	"source_type" "payload"."enum_scraper_repos_source_type" DEFAULT 'git' NOT NULL,
  	"git_url" varchar,
  	"git_branch" varchar DEFAULT 'main',
  	"code" jsonb,
  	"catalog_id" integer,
  	"last_sync_at" timestamp(3) with time zone,
  	"last_sync_status" "payload"."enum_scraper_repos_last_sync_status",
  	"last_sync_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."scrapers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"repo_id" integer NOT NULL,
  	"repo_created_by" numeric,
  	"runtime" "payload"."enum_scrapers_runtime" DEFAULT 'python' NOT NULL,
  	"entrypoint" varchar NOT NULL,
  	"output_file" varchar DEFAULT 'data.csv',
  	"schedule" varchar,
  	"enabled" boolean DEFAULT true,
  	"timeout_secs" numeric DEFAULT 300,
  	"memory_mb" numeric DEFAULT 512,
  	"env_vars" jsonb DEFAULT '{}'::jsonb,
  	"target_dataset_id" integer,
  	"auto_import" boolean DEFAULT false,
  	"last_run_at" timestamp(3) with time zone,
  	"last_run_status" "payload"."enum_scrapers_last_run_status",
  	"statistics" jsonb DEFAULT '{"totalRuns":0,"successRuns":0,"failedRuns":0}'::jsonb,
  	"next_run_at" timestamp(3) with time zone,
  	"webhook_enabled" boolean DEFAULT false,
  	"webhook_token" varchar,
  	"webhook_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."scraper_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"scraper_id" integer NOT NULL,
  	"scraper_owner" numeric,
  	"status" "payload"."enum_scraper_runs_status" DEFAULT 'queued' NOT NULL,
  	"triggered_by" "payload"."enum_scraper_runs_triggered_by" DEFAULT 'manual',
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"duration_ms" numeric,
  	"exit_code" numeric,
  	"stdout" varchar,
  	"stderr" varchar,
  	"error" varchar,
  	"output_rows" numeric,
  	"output_bytes" numeric,
  	"result_file_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"dataset_id" integer,
  	"dataset_is_public" boolean DEFAULT false,
  	"catalog_owner_id" numeric,
  	"ingest_job_id" integer,
  	"original_data" jsonb,
  	"location_latitude" numeric,
  	"location_longitude" numeric,
  	"coordinate_source_type" "payload"."enum_events_coordinate_source_type" DEFAULT 'none',
  	"coordinate_source_source_columns_latitude_column" varchar,
  	"coordinate_source_source_columns_longitude_column" varchar,
  	"coordinate_source_source_columns_combined_column" varchar,
  	"coordinate_source_source_columns_format" varchar,
  	"coordinate_source_confidence" numeric,
  	"coordinate_source_normalized_address" varchar,
  	"coordinate_source_validation_status" "payload"."enum_events_coordinate_source_validation_status",
  	"event_timestamp" timestamp(3) with time zone,
  	"location_name" varchar,
  	"validation_errors" jsonb,
  	"geocoding_info_original_address" varchar,
  	"geocoding_info_geocoding_status" "payload"."enum_events_geocoding_info_geocoding_status",
  	"geocoding_info_provider" "payload"."enum_events_geocoding_info_provider",
  	"geocoding_info_confidence" numeric,
  	"geocoding_info_normalized_address" varchar,
  	"unique_id" varchar,
  	"source_id" varchar,
  	"content_hash" varchar,
  	"ingest_batch" numeric,
  	"schema_version_number" numeric,
  	"validation_status" "payload"."enum_events_validation_status" DEFAULT 'pending',
  	"transformations" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_events_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_events_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_dataset_id" integer,
  	"version_dataset_is_public" boolean DEFAULT false,
  	"version_catalog_owner_id" numeric,
  	"version_ingest_job_id" integer,
  	"version_original_data" jsonb,
  	"version_location_latitude" numeric,
  	"version_location_longitude" numeric,
  	"version_coordinate_source_type" "payload"."enum__events_v_version_coordinate_source_type" DEFAULT 'none',
  	"version_coordinate_source_source_columns_latitude_column" varchar,
  	"version_coordinate_source_source_columns_longitude_column" varchar,
  	"version_coordinate_source_source_columns_combined_column" varchar,
  	"version_coordinate_source_source_columns_format" varchar,
  	"version_coordinate_source_confidence" numeric,
  	"version_coordinate_source_normalized_address" varchar,
  	"version_coordinate_source_validation_status" "payload"."enum__events_v_version_coordinate_source_validation_status",
  	"version_event_timestamp" timestamp(3) with time zone,
  	"version_location_name" varchar,
  	"version_validation_errors" jsonb,
  	"version_geocoding_info_original_address" varchar,
  	"version_geocoding_info_geocoding_status" "payload"."enum__events_v_version_geocoding_info_geocoding_status",
  	"version_geocoding_info_provider" "payload"."enum__events_v_version_geocoding_info_provider",
  	"version_geocoding_info_confidence" numeric,
  	"version_geocoding_info_normalized_address" varchar,
  	"version_unique_id" varchar,
  	"version_source_id" varchar,
  	"version_content_hash" varchar,
  	"version_ingest_batch" numeric,
  	"version_schema_version_number" numeric,
  	"version_validation_status" "payload"."enum__events_v_version_validation_status" DEFAULT 'pending',
  	"version_transformations" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__events_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__events_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
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
  	"registration_source" "payload"."enum_users_registration_source" DEFAULT 'admin',
  	"locale" "payload"."enum_users_locale" DEFAULT 'en',
  	"trust_level" "payload"."enum_users_trust_level" DEFAULT '2' NOT NULL,
  	"quotas_max_active_schedules" numeric,
  	"quotas_max_url_fetches_per_day" numeric,
  	"quotas_max_file_uploads_per_day" numeric,
  	"quotas_max_events_per_import" numeric,
  	"quotas_max_total_events" numeric,
  	"quotas_max_ingest_jobs_per_day" numeric,
  	"quotas_max_file_size_m_b" numeric,
  	"quotas_max_catalogs_per_user" numeric,
  	"quotas_max_scraper_repos" numeric,
  	"quotas_max_scraper_runs_per_day" numeric,
  	"custom_quotas" jsonb,
  	"deletion_status" "payload"."enum_users_deletion_status" DEFAULT 'active',
  	"deletion_requested_at" timestamp(3) with time zone,
  	"deletion_scheduled_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"_verified" boolean,
  	"_verificationtoken" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."user_usage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"url_fetches_today" numeric DEFAULT 0,
  	"file_uploads_today" numeric DEFAULT 0,
  	"ingest_jobs_today" numeric DEFAULT 0,
  	"current_active_schedules" numeric DEFAULT 0,
  	"total_events_created" numeric DEFAULT 0,
  	"current_catalogs" numeric DEFAULT 0,
  	"current_scraper_repos" numeric DEFAULT 0,
  	"scraper_runs_today" numeric DEFAULT 0,
  	"last_reset_date" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"created_by_id" integer,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_media_status" DEFAULT 'draft',
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
  
  CREATE TABLE "payload"."_media_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_created_by_id" integer,
  	"version_alt" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__media_v_version_status" DEFAULT 'draft',
  	"version_url" varchar,
  	"version_thumbnail_u_r_l" varchar,
  	"version_filename" varchar,
  	"version_mime_type" varchar,
  	"version_filesize" numeric,
  	"version_width" numeric,
  	"version_height" numeric,
  	"version_focal_x" numeric,
  	"version_focal_y" numeric,
  	"version_sizes_thumbnail_url" varchar,
  	"version_sizes_thumbnail_width" numeric,
  	"version_sizes_thumbnail_height" numeric,
  	"version_sizes_thumbnail_mime_type" varchar,
  	"version_sizes_thumbnail_filesize" numeric,
  	"version_sizes_thumbnail_filename" varchar,
  	"version_sizes_card_url" varchar,
  	"version_sizes_card_width" numeric,
  	"version_sizes_card_height" numeric,
  	"version_sizes_card_mime_type" varchar,
  	"version_sizes_card_filesize" numeric,
  	"version_sizes_card_filename" varchar,
  	"version_sizes_tablet_url" varchar,
  	"version_sizes_tablet_width" numeric,
  	"version_sizes_tablet_height" numeric,
  	"version_sizes_tablet_mime_type" varchar,
  	"version_sizes_tablet_filesize" numeric,
  	"version_sizes_tablet_filename" varchar,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__media_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."location_cache" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"original_address" varchar,
  	"normalized_address" varchar,
  	"latitude" numeric,
  	"longitude" numeric,
  	"provider" varchar,
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
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_location_cache_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_location_cache_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_original_address" varchar,
  	"version_normalized_address" varchar,
  	"version_latitude" numeric,
  	"version_longitude" numeric,
  	"version_provider" varchar,
  	"version_confidence" numeric,
  	"version_hit_count" numeric DEFAULT 1,
  	"version_last_used" timestamp(3) with time zone,
  	"version_components_street_number" varchar,
  	"version_components_street_name" varchar,
  	"version_components_city" varchar,
  	"version_components_region" varchar,
  	"version_components_postal_code" varchar,
  	"version_components_country" varchar,
  	"version_metadata" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__location_cache_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__location_cache_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."geocoding_providers_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_geocoding_providers_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."geocoding_providers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"type" "payload"."enum_geocoding_providers_type",
  	"enabled" boolean DEFAULT true,
  	"priority" numeric DEFAULT 1,
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
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_geocoding_providers_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_geocoding_providers_v_version_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__geocoding_providers_v_version_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."_geocoding_providers_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_type" "payload"."enum__geocoding_providers_v_version_type",
  	"version_enabled" boolean DEFAULT true,
  	"version_priority" numeric DEFAULT 1,
  	"version_rate_limit" numeric DEFAULT 10,
  	"version_config_google_api_key" varchar,
  	"version_config_google_region" varchar,
  	"version_config_google_language" varchar DEFAULT 'en',
  	"version_config_nominatim_base_url" varchar DEFAULT 'https://nominatim.openstreetmap.org',
  	"version_config_nominatim_user_agent" varchar DEFAULT 'TimeTiles-App/1.0',
  	"version_config_nominatim_email" varchar,
  	"version_config_nominatim_countrycodes" varchar,
  	"version_config_nominatim_addressdetails" boolean DEFAULT true,
  	"version_config_nominatim_extratags" boolean DEFAULT false,
  	"version_config_opencage_api_key" varchar,
  	"version_config_opencage_language" varchar DEFAULT 'en',
  	"version_config_opencage_countrycode" varchar,
  	"version_config_opencage_bounds_enabled" boolean DEFAULT false,
  	"version_config_opencage_bounds_southwest_lat" numeric,
  	"version_config_opencage_bounds_southwest_lng" numeric,
  	"version_config_opencage_bounds_northeast_lat" numeric,
  	"version_config_opencage_bounds_northeast_lng" numeric,
  	"version_config_opencage_annotations" boolean DEFAULT true,
  	"version_config_opencage_abbrv" boolean DEFAULT false,
  	"version_statistics_total_requests" numeric DEFAULT 0,
  	"version_statistics_successful_requests" numeric DEFAULT 0,
  	"version_statistics_failed_requests" numeric DEFAULT 0,
  	"version_statistics_last_used" timestamp(3) with time zone,
  	"version_statistics_average_response_time" numeric,
  	"version_notes" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__geocoding_providers_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__geocoding_providers_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."pages_blocks_hero_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link" varchar,
  	"variant" "payload"."enum_pages_blocks_hero_buttons_variant" DEFAULT 'default'
  );
  
  CREATE TABLE "payload"."pages_blocks_hero_buttons_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"background" "payload"."enum_pages_blocks_hero_background" DEFAULT 'gradient',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_hero_locales" (
  	"title" varchar,
  	"subtitle" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_features_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum_pages_blocks_features_features_icon",
  	"accent" "payload"."enum_pages_blocks_features_features_accent" DEFAULT 'none'
  );
  
  CREATE TABLE "payload"."pages_blocks_features_features_locales" (
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"columns" "payload"."enum_pages_blocks_features_columns" DEFAULT '3',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_features_locales" (
  	"section_title" varchar,
  	"section_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_stats_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum_pages_blocks_stats_stats_icon"
  );
  
  CREATE TABLE "payload"."pages_blocks_stats_stats_locales" (
  	"value" varchar,
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_details_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum_pages_blocks_details_grid_items_icon",
  	"link" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_details_grid_items_locales" (
  	"label" varchar,
  	"value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_details_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "payload"."enum_pages_blocks_details_grid_variant" DEFAULT 'grid-3',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_details_grid_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline_items_locales" (
  	"date" varchar,
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "payload"."enum_pages_blocks_timeline_variant" DEFAULT 'vertical',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"avatar" "payload"."enum_pages_blocks_testimonials_items_avatar"
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonials_items_locales" (
  	"quote" varchar,
  	"author" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "payload"."enum_pages_blocks_testimonials_variant" DEFAULT 'grid',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonials_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_rich_text_locales" (
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"button_link" varchar,
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_cta_locales" (
  	"headline" varchar,
  	"description" varchar,
  	"button_text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_newsletter_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_newsletter_form_locales" (
  	"headline" varchar DEFAULT 'Stay Mapped In',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_newsletter_c_t_a" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "payload"."enum_pages_blocks_newsletter_c_t_a_variant" DEFAULT 'default',
  	"size" "payload"."enum_pages_blocks_newsletter_c_t_a_size" DEFAULT 'default',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_newsletter_c_t_a_locales" (
  	"headline" varchar DEFAULT 'Never Miss a Discovery',
  	"description" varchar DEFAULT 'Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe to Updates',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"site_id" integer,
  	"layout_override_id" integer,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."pages_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"link" varchar,
  	"variant" "payload"."enum__pages_v_blocks_hero_buttons_variant" DEFAULT 'default',
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero_buttons_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"background" "payload"."enum__pages_v_blocks_hero_background" DEFAULT 'gradient',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero_locales" (
  	"title" varchar,
  	"subtitle" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_features_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum__pages_v_blocks_features_features_icon",
  	"accent" "payload"."enum__pages_v_blocks_features_features_accent" DEFAULT 'none',
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_features_features_locales" (
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"columns" "payload"."enum__pages_v_blocks_features_columns" DEFAULT '3',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_features_locales" (
  	"section_title" varchar,
  	"section_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stats_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum__pages_v_blocks_stats_stats_icon",
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stats_stats_locales" (
  	"value" varchar,
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_details_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum__pages_v_blocks_details_grid_items_icon",
  	"link" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_details_grid_items_locales" (
  	"label" varchar,
  	"value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_details_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "payload"."enum__pages_v_blocks_details_grid_variant" DEFAULT 'grid-3',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_details_grid_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline_items_locales" (
  	"date" varchar,
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "payload"."enum__pages_v_blocks_timeline_variant" DEFAULT 'vertical',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"avatar" "payload"."enum__pages_v_blocks_testimonials_items_avatar",
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonials_items_locales" (
  	"quote" varchar,
  	"author" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "payload"."enum__pages_v_blocks_testimonials_variant" DEFAULT 'grid',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonials_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_rich_text_locales" (
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"button_link" varchar,
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_cta_locales" (
  	"headline" varchar,
  	"description" varchar,
  	"button_text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_newsletter_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_newsletter_form_locales" (
  	"headline" varchar DEFAULT 'Stay Mapped In',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "payload"."enum__pages_v_blocks_newsletter_c_t_a_variant" DEFAULT 'default',
  	"size" "payload"."enum__pages_v_blocks_newsletter_c_t_a_size" DEFAULT 'default',
  	"block_style_padding_top" "payload"."pt",
  	"block_style_padding_bottom" "payload"."pb",
  	"block_style_max_width" "payload"."mw",
  	"block_style_separator" "payload"."sep",
  	"block_style_background_color" varchar,
  	"block_style_anchor_id" varchar,
  	"block_style_hide_on_mobile" boolean DEFAULT false,
  	"block_style_hide_on_desktop" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_newsletter_c_t_a_locales" (
  	"headline" varchar DEFAULT 'Never Miss a Discovery',
  	"description" varchar DEFAULT 'Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe to Updates',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_site_id" integer,
  	"version_layout_override_id" integer,
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__pages_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."_pages_v_locales" (
  	"version_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."sites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"domain" varchar,
  	"is_default" boolean DEFAULT false,
  	"branding_title" varchar,
  	"branding_logo_id" integer,
  	"branding_logo_dark_id" integer,
  	"branding_favicon_id" integer,
  	"branding_colors_primary" varchar,
  	"branding_colors_primary_foreground" varchar,
  	"branding_colors_secondary" varchar,
  	"branding_colors_secondary_foreground" varchar,
  	"branding_colors_background" varchar,
  	"branding_colors_foreground" varchar,
  	"branding_colors_card" varchar,
  	"branding_colors_card_foreground" varchar,
  	"branding_colors_muted" varchar,
  	"branding_colors_muted_foreground" varchar,
  	"branding_colors_accent" varchar,
  	"branding_colors_accent_foreground" varchar,
  	"branding_colors_destructive" varchar,
  	"branding_colors_border" varchar,
  	"branding_colors_ring" varchar,
  	"branding_typography_font_pairing" "payload"."enum_sites_branding_typography_font_pairing",
  	"branding_style_border_radius" "payload"."enum_sites_branding_style_border_radius",
  	"branding_style_density" "payload"."enum_sites_branding_style_density",
  	"branding_theme_id" integer,
  	"custom_code_head_html" varchar,
  	"custom_code_custom_c_s_s" varchar,
  	"custom_code_body_start_html" varchar,
  	"custom_code_body_end_html" varchar,
  	"default_layout_id" integer,
  	"is_public" boolean DEFAULT true,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_sites_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_sites_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_domain" varchar,
  	"version_is_default" boolean DEFAULT false,
  	"version_branding_title" varchar,
  	"version_branding_logo_id" integer,
  	"version_branding_logo_dark_id" integer,
  	"version_branding_favicon_id" integer,
  	"version_branding_colors_primary" varchar,
  	"version_branding_colors_primary_foreground" varchar,
  	"version_branding_colors_secondary" varchar,
  	"version_branding_colors_secondary_foreground" varchar,
  	"version_branding_colors_background" varchar,
  	"version_branding_colors_foreground" varchar,
  	"version_branding_colors_card" varchar,
  	"version_branding_colors_card_foreground" varchar,
  	"version_branding_colors_muted" varchar,
  	"version_branding_colors_muted_foreground" varchar,
  	"version_branding_colors_accent" varchar,
  	"version_branding_colors_accent_foreground" varchar,
  	"version_branding_colors_destructive" varchar,
  	"version_branding_colors_border" varchar,
  	"version_branding_colors_ring" varchar,
  	"version_branding_typography_font_pairing" "payload"."enum__sites_v_version_branding_typography_font_pairing",
  	"version_branding_style_border_radius" "payload"."enum__sites_v_version_branding_style_border_radius",
  	"version_branding_style_density" "payload"."enum__sites_v_version_branding_style_density",
  	"version_branding_theme_id" integer,
  	"version_custom_code_head_html" varchar,
  	"version_custom_code_custom_c_s_s" varchar,
  	"version_custom_code_body_start_html" varchar,
  	"version_custom_code_body_end_html" varchar,
  	"version_default_layout_id" integer,
  	"version_is_public" boolean DEFAULT true,
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__sites_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__sites_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."themes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" varchar,
  	"colors_primary" varchar,
  	"colors_primary_foreground" varchar,
  	"colors_secondary" varchar,
  	"colors_secondary_foreground" varchar,
  	"colors_background" varchar,
  	"colors_foreground" varchar,
  	"colors_card" varchar,
  	"colors_card_foreground" varchar,
  	"colors_muted" varchar,
  	"colors_muted_foreground" varchar,
  	"colors_accent" varchar,
  	"colors_accent_foreground" varchar,
  	"colors_destructive" varchar,
  	"colors_border" varchar,
  	"colors_ring" varchar,
  	"dark_colors_primary" varchar,
  	"dark_colors_primary_foreground" varchar,
  	"dark_colors_secondary" varchar,
  	"dark_colors_secondary_foreground" varchar,
  	"dark_colors_background" varchar,
  	"dark_colors_foreground" varchar,
  	"dark_colors_card" varchar,
  	"dark_colors_card_foreground" varchar,
  	"dark_colors_muted" varchar,
  	"dark_colors_muted_foreground" varchar,
  	"dark_colors_accent" varchar,
  	"dark_colors_accent_foreground" varchar,
  	"dark_colors_destructive" varchar,
  	"dark_colors_border" varchar,
  	"dark_colors_ring" varchar,
  	"typography_font_pairing" "payload"."enum_themes_typography_font_pairing",
  	"style_border_radius" "payload"."enum_themes_style_border_radius",
  	"style_density" "payload"."enum_themes_style_density",
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_themes_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_themes_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_description" varchar,
  	"version_colors_primary" varchar,
  	"version_colors_primary_foreground" varchar,
  	"version_colors_secondary" varchar,
  	"version_colors_secondary_foreground" varchar,
  	"version_colors_background" varchar,
  	"version_colors_foreground" varchar,
  	"version_colors_card" varchar,
  	"version_colors_card_foreground" varchar,
  	"version_colors_muted" varchar,
  	"version_colors_muted_foreground" varchar,
  	"version_colors_accent" varchar,
  	"version_colors_accent_foreground" varchar,
  	"version_colors_destructive" varchar,
  	"version_colors_border" varchar,
  	"version_colors_ring" varchar,
  	"version_dark_colors_primary" varchar,
  	"version_dark_colors_primary_foreground" varchar,
  	"version_dark_colors_secondary" varchar,
  	"version_dark_colors_secondary_foreground" varchar,
  	"version_dark_colors_background" varchar,
  	"version_dark_colors_foreground" varchar,
  	"version_dark_colors_card" varchar,
  	"version_dark_colors_card_foreground" varchar,
  	"version_dark_colors_muted" varchar,
  	"version_dark_colors_muted_foreground" varchar,
  	"version_dark_colors_accent" varchar,
  	"version_dark_colors_accent_foreground" varchar,
  	"version_dark_colors_destructive" varchar,
  	"version_dark_colors_border" varchar,
  	"version_dark_colors_ring" varchar,
  	"version_typography_font_pairing" "payload"."enum__themes_v_version_typography_font_pairing",
  	"version_style_border_radius" "payload"."enum__themes_v_version_style_border_radius",
  	"version_style_density" "payload"."enum__themes_v_version_style_density",
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__themes_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__themes_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."layout_templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" varchar,
  	"header_variant" "payload"."enum_layout_templates_header_variant" DEFAULT 'marketing',
  	"sticky_header" boolean DEFAULT true,
  	"footer_variant" "payload"."enum_layout_templates_footer_variant" DEFAULT 'full',
  	"content_max_width" "payload"."enum_layout_templates_content_max_width" DEFAULT 'lg',
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "payload"."enum_layout_templates_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_layout_templates_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_description" varchar,
  	"version_header_variant" "payload"."enum__layout_templates_v_version_header_variant" DEFAULT 'marketing',
  	"version_sticky_header" boolean DEFAULT true,
  	"version_footer_variant" "payload"."enum__layout_templates_v_version_footer_variant" DEFAULT 'full',
  	"version_content_max_width" "payload"."enum__layout_templates_v_version_content_max_width" DEFAULT 'lg',
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__layout_templates_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__layout_templates_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
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
  	"site_id" integer,
  	"is_default" boolean DEFAULT false,
  	"data_scope_mode" "payload"."enum_views_data_scope_mode" DEFAULT 'all',
  	"filter_config_mode" "payload"."enum_views_filter_config_mode" DEFAULT 'auto',
  	"filter_config_max_filters" numeric DEFAULT 5,
  	"filter_config_default_filters" jsonb,
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
  	"version_site_id" integer,
  	"version_is_default" boolean DEFAULT false,
  	"version_data_scope_mode" "payload"."enum__views_v_version_data_scope_mode" DEFAULT 'all',
  	"version_filter_config_mode" "payload"."enum__views_v_version_filter_config_mode" DEFAULT 'auto',
  	"version_filter_config_max_filters" numeric DEFAULT 5,
  	"version_filter_config_default_filters" jsonb,
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
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__views_v_published_locale",
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
  
  CREATE TABLE "payload"."schema_detectors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"description" varchar,
  	"enabled" boolean DEFAULT true,
  	"priority" numeric DEFAULT 100,
  	"options" jsonb,
  	"statistics_total_runs" numeric DEFAULT 0,
  	"statistics_last_used" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
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
  	"concurrency_key" varchar,
  	"meta" jsonb,
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
  	"data_exports_id" integer,
  	"datasets_id" integer,
  	"dataset_schemas_id" integer,
  	"audit_log_id" integer,
  	"ingest_files_id" integer,
  	"ingest_jobs_id" integer,
  	"scheduled_ingests_id" integer,
  	"scraper_repos_id" integer,
  	"scrapers_id" integer,
  	"scraper_runs_id" integer,
  	"events_id" integer,
  	"users_id" integer,
  	"user_usage_id" integer,
  	"media_id" integer,
  	"location_cache_id" integer,
  	"geocoding_providers_id" integer,
  	"pages_id" integer,
  	"sites_id" integer,
  	"themes_id" integer,
  	"layout_templates_id" integer,
  	"views_id" integer,
  	"schema_detectors_id" integer
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
  	"url" varchar
  );
  
  CREATE TABLE "payload"."main_menu_nav_items_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."main_menu" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_status" "payload"."enum_main_menu_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."_main_menu_v_version_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_main_menu_v_version_nav_items_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_main_menu_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version__status" "payload"."enum__main_menu_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__main_menu_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."footer_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "payload"."enum_footer_social_links_platform",
  	"url" varchar
  );
  
  CREATE TABLE "payload"."footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar
  );
  
  CREATE TABLE "payload"."footer_columns_links_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."footer_columns_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."footer" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"newsletter_enabled" boolean DEFAULT true,
  	"_status" "payload"."enum_footer_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."footer_locales" (
  	"tagline" varchar,
  	"newsletter_headline" varchar DEFAULT 'Stay Mapped In',
  	"newsletter_placeholder" varchar DEFAULT 'your@email.address',
  	"newsletter_button_text" varchar DEFAULT 'Subscribe',
  	"copyright" varchar,
  	"credits" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_footer_v_version_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"platform" "payload"."enum__footer_v_version_social_links_platform",
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_footer_v_version_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_footer_v_version_columns_links_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_footer_v_version_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_footer_v_version_columns_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_footer_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_newsletter_enabled" boolean DEFAULT true,
  	"version__status" "payload"."enum__footer_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__footer_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."_footer_v_locales" (
  	"version_tagline" varchar,
  	"version_newsletter_headline" varchar DEFAULT 'Stay Mapped In',
  	"version_newsletter_placeholder" varchar DEFAULT 'your@email.address',
  	"version_newsletter_button_text" varchar DEFAULT 'Subscribe',
  	"version_copyright" varchar,
  	"version_credits" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."branding" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"logo_light_id" integer,
  	"logo_dark_id" integer,
  	"favicon_source_light_id" integer,
  	"favicon_source_dark_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."branding_locales" (
  	"site_name" varchar DEFAULT 'TimeTiles',
  	"site_description" varchar DEFAULT 'Making spatial and temporal data analysis accessible to everyone.',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."settings_geocoding_provider_selection_required_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_settings_geocoding_provider_selection_required_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"newsletter_service_url" varchar,
  	"newsletter_auth_header" varchar,
  	"legal_terms_url" varchar,
  	"legal_privacy_url" varchar,
  	"geocoding_enabled" boolean DEFAULT true,
  	"geocoding_fallback_enabled" boolean DEFAULT true,
  	"geocoding_provider_selection_strategy" "payload"."enum_settings_geocoding_provider_selection_strategy" DEFAULT 'priority',
  	"geocoding_caching_enabled" boolean DEFAULT true,
  	"geocoding_caching_ttl_days" numeric DEFAULT 30,
  	"feature_flags_allow_private_imports" boolean DEFAULT true,
  	"feature_flags_enable_scheduled_ingests" boolean DEFAULT true,
  	"feature_flags_enable_registration" boolean DEFAULT true,
  	"feature_flags_enable_event_creation" boolean DEFAULT true,
  	"feature_flags_enable_dataset_creation" boolean DEFAULT true,
  	"feature_flags_enable_import_creation" boolean DEFAULT true,
  	"feature_flags_enable_scheduled_job_execution" boolean DEFAULT true,
  	"feature_flags_enable_url_fetch_caching" boolean DEFAULT true,
  	"feature_flags_enable_scrapers" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."settings_locales" (
  	"legal_registration_disclaimer" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."catalogs" ADD CONSTRAINT "catalogs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_catalogs_v" ADD CONSTRAINT "_catalogs_v_parent_id_catalogs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_catalogs_v" ADD CONSTRAINT "_catalogs_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."datasets_id_strategy_computed_id_fields" ADD CONSTRAINT "datasets_id_strategy_computed_id_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."datasets_ingest_transforms" ADD CONSTRAINT "datasets_ingest_transforms_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."datasets_ingest_transforms" ADD CONSTRAINT "datasets_ingest_transforms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."datasets" ADD CONSTRAINT "datasets_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."datasets" ADD CONSTRAINT "datasets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."datasets" ADD CONSTRAINT "datasets_schema_detector_id_schema_detectors_id_fk" FOREIGN KEY ("schema_detector_id") REFERENCES "payload"."schema_detectors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_id_strategy_computed_id_fields" ADD CONSTRAINT "_datasets_v_version_id_strategy_computed_id_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ADD CONSTRAINT "_datasets_v_version_ingest_transforms_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ADD CONSTRAINT "_datasets_v_version_ingest_transforms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v" ADD CONSTRAINT "_datasets_v_parent_id_datasets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v" ADD CONSTRAINT "_datasets_v_version_catalog_id_catalogs_id_fk" FOREIGN KEY ("version_catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v" ADD CONSTRAINT "_datasets_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v" ADD CONSTRAINT "_datasets_v_version_schema_detector_id_schema_detectors_id_fk" FOREIGN KEY ("version_schema_detector_id") REFERENCES "payload"."schema_detectors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_schema_summary_new_fields" ADD CONSTRAINT "dataset_schemas_schema_summary_new_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_schema_summary_removed_fields" ADD CONSTRAINT "dataset_schemas_schema_summary_removed_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_schema_summary_type_changes" ADD CONSTRAINT "dataset_schemas_schema_summary_type_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_schema_summary_enum_changes" ADD CONSTRAINT "dataset_schemas_schema_summary_enum_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_ingest_sources" ADD CONSTRAINT "dataset_schemas_ingest_sources_ingest_job_id_ingest_jobs_id_fk" FOREIGN KEY ("ingest_job_id") REFERENCES "payload"."ingest_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_ingest_sources" ADD CONSTRAINT "dataset_schemas_ingest_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas" ADD CONSTRAINT "dataset_schemas_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas" ADD CONSTRAINT "dataset_schemas_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_schema_summary_new_fields" ADD CONSTRAINT "_dataset_schemas_v_version_schema_summary_new_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" ADD CONSTRAINT "_dataset_schemas_v_version_schema_summary_removed_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_schema_summary_type_changes" ADD CONSTRAINT "_dataset_schemas_v_version_schema_summary_type_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" ADD CONSTRAINT "_dataset_schemas_v_version_schema_summary_enum_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_ingest_sources" ADD CONSTRAINT "_dataset_schemas_v_version_ingest_sources_ingest_job_id_ingest_jobs_id_fk" FOREIGN KEY ("ingest_job_id") REFERENCES "payload"."ingest_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_ingest_sources" ADD CONSTRAINT "_dataset_schemas_v_version_ingest_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD CONSTRAINT "_dataset_schemas_v_parent_id_dataset_schemas_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD CONSTRAINT "_dataset_schemas_v_version_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD CONSTRAINT "_dataset_schemas_v_version_approved_by_id_users_id_fk" FOREIGN KEY ("version_approved_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."audit_log" ADD CONSTRAINT "audit_log_performed_by_id_users_id_fk" FOREIGN KEY ("performed_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_files" ADD CONSTRAINT "ingest_files_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_files" ADD CONSTRAINT "ingest_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_files" ADD CONSTRAINT "ingest_files_target_dataset_id_datasets_id_fk" FOREIGN KEY ("target_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_files" ADD CONSTRAINT "ingest_files_scheduled_ingest_id_scheduled_ingests_id_fk" FOREIGN KEY ("scheduled_ingest_id") REFERENCES "payload"."scheduled_ingests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_files_rels" ADD CONSTRAINT "ingest_files_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."ingest_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."ingest_files_rels" ADD CONSTRAINT "ingest_files_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_files_v" ADD CONSTRAINT "_ingest_files_v_parent_id_ingest_files_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."ingest_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_files_v" ADD CONSTRAINT "_ingest_files_v_version_catalog_id_catalogs_id_fk" FOREIGN KEY ("version_catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_files_v" ADD CONSTRAINT "_ingest_files_v_version_user_id_users_id_fk" FOREIGN KEY ("version_user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_files_v" ADD CONSTRAINT "_ingest_files_v_version_target_dataset_id_datasets_id_fk" FOREIGN KEY ("version_target_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_files_v" ADD CONSTRAINT "_ingest_files_v_version_scheduled_ingest_id_scheduled_ingests_id_fk" FOREIGN KEY ("version_scheduled_ingest_id") REFERENCES "payload"."scheduled_ingests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_files_v_rels" ADD CONSTRAINT "_ingest_files_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_ingest_files_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_files_v_rels" ADD CONSTRAINT "_ingest_files_v_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."ingest_jobs_errors" ADD CONSTRAINT "ingest_jobs_errors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."ingest_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."ingest_jobs" ADD CONSTRAINT "ingest_jobs_ingest_file_id_ingest_files_id_fk" FOREIGN KEY ("ingest_file_id") REFERENCES "payload"."ingest_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_jobs" ADD CONSTRAINT "ingest_jobs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_jobs" ADD CONSTRAINT "ingest_jobs_schema_validation_approved_by_id_users_id_fk" FOREIGN KEY ("schema_validation_approved_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_jobs" ADD CONSTRAINT "ingest_jobs_dataset_schema_version_id_dataset_schemas_id_fk" FOREIGN KEY ("dataset_schema_version_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_jobs_v_version_errors" ADD CONSTRAINT "_ingest_jobs_v_version_errors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_ingest_jobs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD CONSTRAINT "_ingest_jobs_v_parent_id_ingest_jobs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."ingest_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD CONSTRAINT "_ingest_jobs_v_version_ingest_file_id_ingest_files_id_fk" FOREIGN KEY ("version_ingest_file_id") REFERENCES "payload"."ingest_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD CONSTRAINT "_ingest_jobs_v_version_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD CONSTRAINT "_ingest_jobs_v_version_schema_validation_approved_by_id_users_id_fk" FOREIGN KEY ("version_schema_validation_approved_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD CONSTRAINT "_ingest_jobs_v_version_dataset_schema_version_id_dataset_schemas_id_fk" FOREIGN KEY ("version_dataset_schema_version_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_ingests_multi_sheet_config_sheets" ADD CONSTRAINT "scheduled_ingests_multi_sheet_config_sheets_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_ingests_multi_sheet_config_sheets" ADD CONSTRAINT "scheduled_ingests_multi_sheet_config_sheets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."scheduled_ingests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_ingests_execution_history" ADD CONSTRAINT "scheduled_ingests_execution_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."scheduled_ingests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_ingests" ADD CONSTRAINT "scheduled_ingests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_ingests" ADD CONSTRAINT "scheduled_ingests_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_ingests" ADD CONSTRAINT "scheduled_ingests_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_ingests" ADD CONSTRAINT "scheduled_ingests_source_ingest_file_id_ingest_files_id_fk" FOREIGN KEY ("source_ingest_file_id") REFERENCES "payload"."ingest_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_ingests_v_version_multi_sheet_config_sheets" ADD CONSTRAINT "_scheduled_ingests_v_version_multi_sheet_config_sheets_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_ingests_v_version_multi_sheet_config_sheets" ADD CONSTRAINT "_scheduled_ingests_v_version_multi_sheet_config_sheets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_scheduled_ingests_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_ingests_v_version_execution_history" ADD CONSTRAINT "_scheduled_ingests_v_version_execution_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_scheduled_ingests_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD CONSTRAINT "_scheduled_ingests_v_parent_id_scheduled_ingests_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."scheduled_ingests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD CONSTRAINT "_scheduled_ingests_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD CONSTRAINT "_scheduled_ingests_v_version_catalog_id_catalogs_id_fk" FOREIGN KEY ("version_catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD CONSTRAINT "_scheduled_ingests_v_version_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD CONSTRAINT "_scheduled_ingests_v_version_source_ingest_file_id_ingest_files_id_fk" FOREIGN KEY ("version_source_ingest_file_id") REFERENCES "payload"."ingest_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scraper_repos" ADD CONSTRAINT "scraper_repos_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scraper_repos" ADD CONSTRAINT "scraper_repos_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scrapers" ADD CONSTRAINT "scrapers_repo_id_scraper_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "payload"."scraper_repos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scrapers" ADD CONSTRAINT "scrapers_target_dataset_id_datasets_id_fk" FOREIGN KEY ("target_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scraper_runs" ADD CONSTRAINT "scraper_runs_scraper_id_scrapers_id_fk" FOREIGN KEY ("scraper_id") REFERENCES "payload"."scrapers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scraper_runs" ADD CONSTRAINT "scraper_runs_result_file_id_ingest_files_id_fk" FOREIGN KEY ("result_file_id") REFERENCES "payload"."ingest_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."events" ADD CONSTRAINT "events_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."events" ADD CONSTRAINT "events_ingest_job_id_ingest_jobs_id_fk" FOREIGN KEY ("ingest_job_id") REFERENCES "payload"."ingest_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_events_v" ADD CONSTRAINT "_events_v_parent_id_events_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_events_v" ADD CONSTRAINT "_events_v_version_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_events_v" ADD CONSTRAINT "_events_v_version_ingest_job_id_ingest_jobs_id_fk" FOREIGN KEY ("version_ingest_job_id") REFERENCES "payload"."ingest_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."user_usage" ADD CONSTRAINT "user_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."media" ADD CONSTRAINT "media_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_media_v" ADD CONSTRAINT "_media_v_parent_id_media_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_media_v" ADD CONSTRAINT "_media_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_location_cache_v" ADD CONSTRAINT "_location_cache_v_parent_id_location_cache_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."location_cache"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."geocoding_providers_tags" ADD CONSTRAINT "geocoding_providers_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."geocoding_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_geocoding_providers_v_version_tags" ADD CONSTRAINT "_geocoding_providers_v_version_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_geocoding_providers_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD CONSTRAINT "_geocoding_providers_v_parent_id_geocoding_providers_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."geocoding_providers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero_buttons" ADD CONSTRAINT "pages_blocks_hero_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero_buttons_locales" ADD CONSTRAINT "pages_blocks_hero_buttons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hero_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero_locales" ADD CONSTRAINT "pages_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_features_features" ADD CONSTRAINT "pages_blocks_features_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_features_features_locales" ADD CONSTRAINT "pages_blocks_features_features_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_features_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_features" ADD CONSTRAINT "pages_blocks_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_features_locales" ADD CONSTRAINT "pages_blocks_features_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stats_stats" ADD CONSTRAINT "pages_blocks_stats_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stats_stats_locales" ADD CONSTRAINT "pages_blocks_stats_stats_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stats_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stats" ADD CONSTRAINT "pages_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_details_grid_items" ADD CONSTRAINT "pages_blocks_details_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_details_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_details_grid_items_locales" ADD CONSTRAINT "pages_blocks_details_grid_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_details_grid_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD CONSTRAINT "pages_blocks_details_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_details_grid_locales" ADD CONSTRAINT "pages_blocks_details_grid_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_details_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline_items" ADD CONSTRAINT "pages_blocks_timeline_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline_items_locales" ADD CONSTRAINT "pages_blocks_timeline_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_timeline_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline" ADD CONSTRAINT "pages_blocks_timeline_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline_locales" ADD CONSTRAINT "pages_blocks_timeline_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonials_items" ADD CONSTRAINT "pages_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonials_items_locales" ADD CONSTRAINT "pages_blocks_testimonials_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_testimonials_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD CONSTRAINT "pages_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonials_locales" ADD CONSTRAINT "pages_blocks_testimonials_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD CONSTRAINT "pages_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_rich_text_locales" ADD CONSTRAINT "pages_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_cta_locales" ADD CONSTRAINT "pages_blocks_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD CONSTRAINT "pages_blocks_newsletter_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_newsletter_form_locales" ADD CONSTRAINT "pages_blocks_newsletter_form_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_newsletter_form"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD CONSTRAINT "pages_blocks_newsletter_c_t_a_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a_locales" ADD CONSTRAINT "pages_blocks_newsletter_c_t_a_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_newsletter_c_t_a"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_layout_override_id_layout_templates_id_fk" FOREIGN KEY ("layout_override_id") REFERENCES "payload"."layout_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero_buttons" ADD CONSTRAINT "_pages_v_blocks_hero_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero_buttons_locales" ADD CONSTRAINT "_pages_v_blocks_hero_buttons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hero_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero_locales" ADD CONSTRAINT "_pages_v_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_features_features" ADD CONSTRAINT "_pages_v_blocks_features_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_features_features_locales" ADD CONSTRAINT "_pages_v_blocks_features_features_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_features_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD CONSTRAINT "_pages_v_blocks_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_features_locales" ADD CONSTRAINT "_pages_v_blocks_features_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats" ADD CONSTRAINT "_pages_v_blocks_stats_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats_locales" ADD CONSTRAINT "_pages_v_blocks_stats_stats_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stats_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD CONSTRAINT "_pages_v_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_items" ADD CONSTRAINT "_pages_v_blocks_details_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_details_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_items_locales" ADD CONSTRAINT "_pages_v_blocks_details_grid_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_details_grid_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD CONSTRAINT "_pages_v_blocks_details_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_locales" ADD CONSTRAINT "_pages_v_blocks_details_grid_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_details_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items" ADD CONSTRAINT "_pages_v_blocks_timeline_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items_locales" ADD CONSTRAINT "_pages_v_blocks_timeline_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_timeline_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD CONSTRAINT "_pages_v_blocks_timeline_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_locales" ADD CONSTRAINT "_pages_v_blocks_timeline_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items" ADD CONSTRAINT "_pages_v_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items_locales" ADD CONSTRAINT "_pages_v_blocks_testimonials_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_testimonials_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD CONSTRAINT "_pages_v_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_locales" ADD CONSTRAINT "_pages_v_blocks_testimonials_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD CONSTRAINT "_pages_v_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text_locales" ADD CONSTRAINT "_pages_v_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD CONSTRAINT "_pages_v_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_cta_locales" ADD CONSTRAINT "_pages_v_blocks_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD CONSTRAINT "_pages_v_blocks_newsletter_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form_locales" ADD CONSTRAINT "_pages_v_blocks_newsletter_form_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_newsletter_form"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD CONSTRAINT "_pages_v_blocks_newsletter_c_t_a_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a_locales" ADD CONSTRAINT "_pages_v_blocks_newsletter_c_t_a_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_newsletter_c_t_a"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_version_layout_override_id_layout_templates_id_fk" FOREIGN KEY ("version_layout_override_id") REFERENCES "payload"."layout_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_branding_logo_id_media_id_fk" FOREIGN KEY ("branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_branding_logo_dark_id_media_id_fk" FOREIGN KEY ("branding_logo_dark_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_branding_favicon_id_media_id_fk" FOREIGN KEY ("branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_branding_theme_id_themes_id_fk" FOREIGN KEY ("branding_theme_id") REFERENCES "payload"."themes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_default_layout_id_layout_templates_id_fk" FOREIGN KEY ("default_layout_id") REFERENCES "payload"."layout_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_parent_id_sites_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_branding_logo_id_media_id_fk" FOREIGN KEY ("version_branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_branding_logo_dark_id_media_id_fk" FOREIGN KEY ("version_branding_logo_dark_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_branding_favicon_id_media_id_fk" FOREIGN KEY ("version_branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_branding_theme_id_themes_id_fk" FOREIGN KEY ("version_branding_theme_id") REFERENCES "payload"."themes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_default_layout_id_layout_templates_id_fk" FOREIGN KEY ("version_default_layout_id") REFERENCES "payload"."layout_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."themes" ADD CONSTRAINT "themes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_themes_v" ADD CONSTRAINT "_themes_v_parent_id_themes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."themes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_themes_v" ADD CONSTRAINT "_themes_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."layout_templates" ADD CONSTRAINT "layout_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_layout_templates_v" ADD CONSTRAINT "_layout_templates_v_parent_id_layout_templates_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."layout_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_layout_templates_v" ADD CONSTRAINT "_layout_templates_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."views_filter_config_fields" ADD CONSTRAINT "views_filter_config_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."views"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."views" ADD CONSTRAINT "views_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."views" ADD CONSTRAINT "views_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."views_rels" ADD CONSTRAINT "views_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."views"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."views_rels" ADD CONSTRAINT "views_rels_catalogs_fk" FOREIGN KEY ("catalogs_id") REFERENCES "payload"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."views_rels" ADD CONSTRAINT "views_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_views_v_version_filter_config_fields" ADD CONSTRAINT "_views_v_version_filter_config_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_views_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_parent_id_views_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."views"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v_rels" ADD CONSTRAINT "_views_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_views_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_views_v_rels" ADD CONSTRAINT "_views_v_rels_catalogs_fk" FOREIGN KEY ("catalogs_id") REFERENCES "payload"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_views_v_rels" ADD CONSTRAINT "_views_v_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_catalogs_fk" FOREIGN KEY ("catalogs_id") REFERENCES "payload"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_exports_fk" FOREIGN KEY ("data_exports_id") REFERENCES "payload"."data_exports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dataset_schemas_fk" FOREIGN KEY ("dataset_schemas_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "payload"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ingest_files_fk" FOREIGN KEY ("ingest_files_id") REFERENCES "payload"."ingest_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ingest_jobs_fk" FOREIGN KEY ("ingest_jobs_id") REFERENCES "payload"."ingest_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scheduled_ingests_fk" FOREIGN KEY ("scheduled_ingests_id") REFERENCES "payload"."scheduled_ingests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scraper_repos_fk" FOREIGN KEY ("scraper_repos_id") REFERENCES "payload"."scraper_repos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scrapers_fk" FOREIGN KEY ("scrapers_id") REFERENCES "payload"."scrapers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scraper_runs_fk" FOREIGN KEY ("scraper_runs_id") REFERENCES "payload"."scraper_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "payload"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_usage_fk" FOREIGN KEY ("user_usage_id") REFERENCES "payload"."user_usage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_location_cache_fk" FOREIGN KEY ("location_cache_id") REFERENCES "payload"."location_cache"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_geocoding_providers_fk" FOREIGN KEY ("geocoding_providers_id") REFERENCES "payload"."geocoding_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sites_fk" FOREIGN KEY ("sites_id") REFERENCES "payload"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_themes_fk" FOREIGN KEY ("themes_id") REFERENCES "payload"."themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_layout_templates_fk" FOREIGN KEY ("layout_templates_id") REFERENCES "payload"."layout_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_views_fk" FOREIGN KEY ("views_id") REFERENCES "payload"."views"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_schema_detectors_fk" FOREIGN KEY ("schema_detectors_id") REFERENCES "payload"."schema_detectors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."main_menu_nav_items" ADD CONSTRAINT "main_menu_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."main_menu"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."main_menu_nav_items_locales" ADD CONSTRAINT "main_menu_nav_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."main_menu_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_main_menu_v_version_nav_items" ADD CONSTRAINT "_main_menu_v_version_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_main_menu_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_main_menu_v_version_nav_items_locales" ADD CONSTRAINT "_main_menu_v_version_nav_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_main_menu_v_version_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_social_links" ADD CONSTRAINT "footer_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_columns_links" ADD CONSTRAINT "footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_columns_links_locales" ADD CONSTRAINT "footer_columns_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer_columns_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_columns" ADD CONSTRAINT "footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_columns_locales" ADD CONSTRAINT "footer_columns_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_locales" ADD CONSTRAINT "footer_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_version_social_links" ADD CONSTRAINT "_footer_v_version_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_version_columns_links" ADD CONSTRAINT "_footer_v_version_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v_version_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_version_columns_links_locales" ADD CONSTRAINT "_footer_v_version_columns_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v_version_columns_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_version_columns" ADD CONSTRAINT "_footer_v_version_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_version_columns_locales" ADD CONSTRAINT "_footer_v_version_columns_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v_version_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_locales" ADD CONSTRAINT "_footer_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."branding" ADD CONSTRAINT "branding_logo_light_id_media_id_fk" FOREIGN KEY ("logo_light_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."branding" ADD CONSTRAINT "branding_logo_dark_id_media_id_fk" FOREIGN KEY ("logo_dark_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."branding" ADD CONSTRAINT "branding_favicon_source_light_id_media_id_fk" FOREIGN KEY ("favicon_source_light_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."branding" ADD CONSTRAINT "branding_favicon_source_dark_id_media_id_fk" FOREIGN KEY ("favicon_source_dark_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."branding_locales" ADD CONSTRAINT "branding_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."branding"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."settings_geocoding_provider_selection_required_tags" ADD CONSTRAINT "settings_geocoding_provider_selection_required_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."settings_locales" ADD CONSTRAINT "settings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "catalogs_slug_idx" ON "payload"."catalogs" USING btree ("slug");
  CREATE INDEX "catalogs_created_by_idx" ON "payload"."catalogs" USING btree ("created_by_id");
  CREATE INDEX "catalogs_updated_at_idx" ON "payload"."catalogs" USING btree ("updated_at");
  CREATE INDEX "catalogs_created_at_idx" ON "payload"."catalogs" USING btree ("created_at");
  CREATE INDEX "catalogs_deleted_at_idx" ON "payload"."catalogs" USING btree ("deleted_at");
  CREATE INDEX "catalogs__status_idx" ON "payload"."catalogs" USING btree ("_status");
  CREATE INDEX "_catalogs_v_parent_idx" ON "payload"."_catalogs_v" USING btree ("parent_id");
  CREATE INDEX "_catalogs_v_version_version_slug_idx" ON "payload"."_catalogs_v" USING btree ("version_slug");
  CREATE INDEX "_catalogs_v_version_version_created_by_idx" ON "payload"."_catalogs_v" USING btree ("version_created_by_id");
  CREATE INDEX "_catalogs_v_version_version_updated_at_idx" ON "payload"."_catalogs_v" USING btree ("version_updated_at");
  CREATE INDEX "_catalogs_v_version_version_created_at_idx" ON "payload"."_catalogs_v" USING btree ("version_created_at");
  CREATE INDEX "_catalogs_v_version_version_deleted_at_idx" ON "payload"."_catalogs_v" USING btree ("version_deleted_at");
  CREATE INDEX "_catalogs_v_version_version__status_idx" ON "payload"."_catalogs_v" USING btree ("version__status");
  CREATE INDEX "_catalogs_v_created_at_idx" ON "payload"."_catalogs_v" USING btree ("created_at");
  CREATE INDEX "_catalogs_v_updated_at_idx" ON "payload"."_catalogs_v" USING btree ("updated_at");
  CREATE INDEX "_catalogs_v_snapshot_idx" ON "payload"."_catalogs_v" USING btree ("snapshot");
  CREATE INDEX "_catalogs_v_published_locale_idx" ON "payload"."_catalogs_v" USING btree ("published_locale");
  CREATE INDEX "_catalogs_v_latest_idx" ON "payload"."_catalogs_v" USING btree ("latest");
  CREATE INDEX "_catalogs_v_autosave_idx" ON "payload"."_catalogs_v" USING btree ("autosave");
  CREATE INDEX "data_exports_user_idx" ON "payload"."data_exports" USING btree ("user_id");
  CREATE INDEX "data_exports_expires_at_idx" ON "payload"."data_exports" USING btree ("expires_at");
  CREATE INDEX "data_exports_updated_at_idx" ON "payload"."data_exports" USING btree ("updated_at");
  CREATE INDEX "data_exports_created_at_idx" ON "payload"."data_exports" USING btree ("created_at");
  CREATE INDEX "datasets_id_strategy_computed_id_fields_order_idx" ON "payload"."datasets_id_strategy_computed_id_fields" USING btree ("_order");
  CREATE INDEX "datasets_id_strategy_computed_id_fields_parent_id_idx" ON "payload"."datasets_id_strategy_computed_id_fields" USING btree ("_parent_id");
  CREATE INDEX "datasets_ingest_transforms_order_idx" ON "payload"."datasets_ingest_transforms" USING btree ("_order");
  CREATE INDEX "datasets_ingest_transforms_parent_id_idx" ON "payload"."datasets_ingest_transforms" USING btree ("_parent_id");
  CREATE INDEX "datasets_ingest_transforms_added_by_idx" ON "payload"."datasets_ingest_transforms" USING btree ("added_by_id");
  CREATE UNIQUE INDEX "datasets_slug_idx" ON "payload"."datasets" USING btree ("slug");
  CREATE INDEX "datasets_catalog_idx" ON "payload"."datasets" USING btree ("catalog_id");
  CREATE INDEX "datasets_catalog_creator_id_idx" ON "payload"."datasets" USING btree ("catalog_creator_id");
  CREATE INDEX "datasets_catalog_is_public_idx" ON "payload"."datasets" USING btree ("catalog_is_public");
  CREATE INDEX "datasets_created_by_idx" ON "payload"."datasets" USING btree ("created_by_id");
  CREATE INDEX "datasets_schema_detector_idx" ON "payload"."datasets" USING btree ("schema_detector_id");
  CREATE INDEX "datasets_updated_at_idx" ON "payload"."datasets" USING btree ("updated_at");
  CREATE INDEX "datasets_created_at_idx" ON "payload"."datasets" USING btree ("created_at");
  CREATE INDEX "datasets_deleted_at_idx" ON "payload"."datasets" USING btree ("deleted_at");
  CREATE INDEX "datasets__status_idx" ON "payload"."datasets" USING btree ("_status");
  CREATE INDEX "_datasets_v_version_id_strategy_computed_id_fields_order_idx" ON "payload"."_datasets_v_version_id_strategy_computed_id_fields" USING btree ("_order");
  CREATE INDEX "_datasets_v_version_id_strategy_computed_id_fields_parent_id_idx" ON "payload"."_datasets_v_version_id_strategy_computed_id_fields" USING btree ("_parent_id");
  CREATE INDEX "_datasets_v_version_ingest_transforms_order_idx" ON "payload"."_datasets_v_version_ingest_transforms" USING btree ("_order");
  CREATE INDEX "_datasets_v_version_ingest_transforms_parent_id_idx" ON "payload"."_datasets_v_version_ingest_transforms" USING btree ("_parent_id");
  CREATE INDEX "_datasets_v_version_ingest_transforms_added_by_idx" ON "payload"."_datasets_v_version_ingest_transforms" USING btree ("added_by_id");
  CREATE INDEX "_datasets_v_parent_idx" ON "payload"."_datasets_v" USING btree ("parent_id");
  CREATE INDEX "_datasets_v_version_version_slug_idx" ON "payload"."_datasets_v" USING btree ("version_slug");
  CREATE INDEX "_datasets_v_version_version_catalog_idx" ON "payload"."_datasets_v" USING btree ("version_catalog_id");
  CREATE INDEX "_datasets_v_version_version_catalog_creator_id_idx" ON "payload"."_datasets_v" USING btree ("version_catalog_creator_id");
  CREATE INDEX "_datasets_v_version_version_catalog_is_public_idx" ON "payload"."_datasets_v" USING btree ("version_catalog_is_public");
  CREATE INDEX "_datasets_v_version_version_created_by_idx" ON "payload"."_datasets_v" USING btree ("version_created_by_id");
  CREATE INDEX "_datasets_v_version_version_schema_detector_idx" ON "payload"."_datasets_v" USING btree ("version_schema_detector_id");
  CREATE INDEX "_datasets_v_version_version_updated_at_idx" ON "payload"."_datasets_v" USING btree ("version_updated_at");
  CREATE INDEX "_datasets_v_version_version_created_at_idx" ON "payload"."_datasets_v" USING btree ("version_created_at");
  CREATE INDEX "_datasets_v_version_version_deleted_at_idx" ON "payload"."_datasets_v" USING btree ("version_deleted_at");
  CREATE INDEX "_datasets_v_version_version__status_idx" ON "payload"."_datasets_v" USING btree ("version__status");
  CREATE INDEX "_datasets_v_created_at_idx" ON "payload"."_datasets_v" USING btree ("created_at");
  CREATE INDEX "_datasets_v_updated_at_idx" ON "payload"."_datasets_v" USING btree ("updated_at");
  CREATE INDEX "_datasets_v_snapshot_idx" ON "payload"."_datasets_v" USING btree ("snapshot");
  CREATE INDEX "_datasets_v_published_locale_idx" ON "payload"."_datasets_v" USING btree ("published_locale");
  CREATE INDEX "_datasets_v_latest_idx" ON "payload"."_datasets_v" USING btree ("latest");
  CREATE INDEX "_datasets_v_autosave_idx" ON "payload"."_datasets_v" USING btree ("autosave");
  CREATE INDEX "dataset_schemas_schema_summary_new_fields_order_idx" ON "payload"."dataset_schemas_schema_summary_new_fields" USING btree ("_order");
  CREATE INDEX "dataset_schemas_schema_summary_new_fields_parent_id_idx" ON "payload"."dataset_schemas_schema_summary_new_fields" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_schema_summary_removed_fields_order_idx" ON "payload"."dataset_schemas_schema_summary_removed_fields" USING btree ("_order");
  CREATE INDEX "dataset_schemas_schema_summary_removed_fields_parent_id_idx" ON "payload"."dataset_schemas_schema_summary_removed_fields" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_schema_summary_type_changes_order_idx" ON "payload"."dataset_schemas_schema_summary_type_changes" USING btree ("_order");
  CREATE INDEX "dataset_schemas_schema_summary_type_changes_parent_id_idx" ON "payload"."dataset_schemas_schema_summary_type_changes" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_schema_summary_enum_changes_order_idx" ON "payload"."dataset_schemas_schema_summary_enum_changes" USING btree ("_order");
  CREATE INDEX "dataset_schemas_schema_summary_enum_changes_parent_id_idx" ON "payload"."dataset_schemas_schema_summary_enum_changes" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_ingest_sources_order_idx" ON "payload"."dataset_schemas_ingest_sources" USING btree ("_order");
  CREATE INDEX "dataset_schemas_ingest_sources_parent_id_idx" ON "payload"."dataset_schemas_ingest_sources" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_ingest_sources_ingest_job_idx" ON "payload"."dataset_schemas_ingest_sources" USING btree ("ingest_job_id");
  CREATE INDEX "dataset_schemas_dataset_idx" ON "payload"."dataset_schemas" USING btree ("dataset_id");
  CREATE INDEX "dataset_schemas_dataset_is_public_idx" ON "payload"."dataset_schemas" USING btree ("dataset_is_public");
  CREATE INDEX "dataset_schemas_catalog_owner_id_idx" ON "payload"."dataset_schemas" USING btree ("catalog_owner_id");
  CREATE INDEX "dataset_schemas_approved_by_idx" ON "payload"."dataset_schemas" USING btree ("approved_by_id");
  CREATE INDEX "dataset_schemas_updated_at_idx" ON "payload"."dataset_schemas" USING btree ("updated_at");
  CREATE INDEX "dataset_schemas_created_at_idx" ON "payload"."dataset_schemas" USING btree ("created_at");
  CREATE INDEX "dataset_schemas_deleted_at_idx" ON "payload"."dataset_schemas" USING btree ("deleted_at");
  CREATE INDEX "dataset_schemas__status_idx" ON "payload"."dataset_schemas" USING btree ("_status");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_new_fields_order_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_new_fields" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_new_fields_parent_id_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_new_fields" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_removed_fields_order_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_removed_fields_parent_id_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_type_changes_order_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_type_changes" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_type_changes_parent_id_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_type_changes" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_enum_changes_order_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_enum_changes_parent_id_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_ingest_sources_order_idx" ON "payload"."_dataset_schemas_v_version_ingest_sources" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_ingest_sources_parent_id_idx" ON "payload"."_dataset_schemas_v_version_ingest_sources" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_ingest_sources_ingest_job_idx" ON "payload"."_dataset_schemas_v_version_ingest_sources" USING btree ("ingest_job_id");
  CREATE INDEX "_dataset_schemas_v_parent_idx" ON "payload"."_dataset_schemas_v" USING btree ("parent_id");
  CREATE INDEX "_dataset_schemas_v_version_version_dataset_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_dataset_id");
  CREATE INDEX "_dataset_schemas_v_version_version_dataset_is_public_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_dataset_is_public");
  CREATE INDEX "_dataset_schemas_v_version_version_catalog_owner_id_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_catalog_owner_id");
  CREATE INDEX "_dataset_schemas_v_version_version_approved_by_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_approved_by_id");
  CREATE INDEX "_dataset_schemas_v_version_version_updated_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_updated_at");
  CREATE INDEX "_dataset_schemas_v_version_version_created_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_created_at");
  CREATE INDEX "_dataset_schemas_v_version_version_deleted_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_deleted_at");
  CREATE INDEX "_dataset_schemas_v_version_version__status_idx" ON "payload"."_dataset_schemas_v" USING btree ("version__status");
  CREATE INDEX "_dataset_schemas_v_created_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("created_at");
  CREATE INDEX "_dataset_schemas_v_updated_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("updated_at");
  CREATE INDEX "_dataset_schemas_v_snapshot_idx" ON "payload"."_dataset_schemas_v" USING btree ("snapshot");
  CREATE INDEX "_dataset_schemas_v_published_locale_idx" ON "payload"."_dataset_schemas_v" USING btree ("published_locale");
  CREATE INDEX "_dataset_schemas_v_latest_idx" ON "payload"."_dataset_schemas_v" USING btree ("latest");
  CREATE INDEX "_dataset_schemas_v_autosave_idx" ON "payload"."_dataset_schemas_v" USING btree ("autosave");
  CREATE INDEX "audit_log_action_idx" ON "payload"."audit_log" USING btree ("action");
  CREATE INDEX "audit_log_user_id_idx" ON "payload"."audit_log" USING btree ("user_id");
  CREATE INDEX "audit_log_performed_by_idx" ON "payload"."audit_log" USING btree ("performed_by_id");
  CREATE INDEX "audit_log_timestamp_idx" ON "payload"."audit_log" USING btree ("timestamp");
  CREATE INDEX "audit_log_updated_at_idx" ON "payload"."audit_log" USING btree ("updated_at");
  CREATE INDEX "audit_log_created_at_idx" ON "payload"."audit_log" USING btree ("created_at");
  CREATE INDEX "ingest_files_catalog_idx" ON "payload"."ingest_files" USING btree ("catalog_id");
  CREATE INDEX "ingest_files_user_idx" ON "payload"."ingest_files" USING btree ("user_id");
  CREATE INDEX "ingest_files_target_dataset_idx" ON "payload"."ingest_files" USING btree ("target_dataset_id");
  CREATE INDEX "ingest_files_scheduled_ingest_idx" ON "payload"."ingest_files" USING btree ("scheduled_ingest_id");
  CREATE INDEX "ingest_files_updated_at_idx" ON "payload"."ingest_files" USING btree ("updated_at");
  CREATE INDEX "ingest_files_created_at_idx" ON "payload"."ingest_files" USING btree ("created_at");
  CREATE INDEX "ingest_files_deleted_at_idx" ON "payload"."ingest_files" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "ingest_files_filename_idx" ON "payload"."ingest_files" USING btree ("filename");
  CREATE INDEX "ingest_files_rels_order_idx" ON "payload"."ingest_files_rels" USING btree ("order");
  CREATE INDEX "ingest_files_rels_parent_idx" ON "payload"."ingest_files_rels" USING btree ("parent_id");
  CREATE INDEX "ingest_files_rels_path_idx" ON "payload"."ingest_files_rels" USING btree ("path");
  CREATE INDEX "ingest_files_rels_datasets_id_idx" ON "payload"."ingest_files_rels" USING btree ("datasets_id");
  CREATE INDEX "_ingest_files_v_parent_idx" ON "payload"."_ingest_files_v" USING btree ("parent_id");
  CREATE INDEX "_ingest_files_v_version_version_catalog_idx" ON "payload"."_ingest_files_v" USING btree ("version_catalog_id");
  CREATE INDEX "_ingest_files_v_version_version_user_idx" ON "payload"."_ingest_files_v" USING btree ("version_user_id");
  CREATE INDEX "_ingest_files_v_version_version_target_dataset_idx" ON "payload"."_ingest_files_v" USING btree ("version_target_dataset_id");
  CREATE INDEX "_ingest_files_v_version_version_scheduled_ingest_idx" ON "payload"."_ingest_files_v" USING btree ("version_scheduled_ingest_id");
  CREATE INDEX "_ingest_files_v_version_version_updated_at_idx" ON "payload"."_ingest_files_v" USING btree ("version_updated_at");
  CREATE INDEX "_ingest_files_v_version_version_created_at_idx" ON "payload"."_ingest_files_v" USING btree ("version_created_at");
  CREATE INDEX "_ingest_files_v_version_version_deleted_at_idx" ON "payload"."_ingest_files_v" USING btree ("version_deleted_at");
  CREATE INDEX "_ingest_files_v_version_version_filename_idx" ON "payload"."_ingest_files_v" USING btree ("version_filename");
  CREATE INDEX "_ingest_files_v_created_at_idx" ON "payload"."_ingest_files_v" USING btree ("created_at");
  CREATE INDEX "_ingest_files_v_updated_at_idx" ON "payload"."_ingest_files_v" USING btree ("updated_at");
  CREATE INDEX "_ingest_files_v_rels_order_idx" ON "payload"."_ingest_files_v_rels" USING btree ("order");
  CREATE INDEX "_ingest_files_v_rels_parent_idx" ON "payload"."_ingest_files_v_rels" USING btree ("parent_id");
  CREATE INDEX "_ingest_files_v_rels_path_idx" ON "payload"."_ingest_files_v_rels" USING btree ("path");
  CREATE INDEX "_ingest_files_v_rels_datasets_id_idx" ON "payload"."_ingest_files_v_rels" USING btree ("datasets_id");
  CREATE INDEX "ingest_jobs_errors_order_idx" ON "payload"."ingest_jobs_errors" USING btree ("_order");
  CREATE INDEX "ingest_jobs_errors_parent_id_idx" ON "payload"."ingest_jobs_errors" USING btree ("_parent_id");
  CREATE INDEX "ingest_jobs_ingest_file_idx" ON "payload"."ingest_jobs" USING btree ("ingest_file_id");
  CREATE INDEX "ingest_jobs_dataset_idx" ON "payload"."ingest_jobs" USING btree ("dataset_id");
  CREATE INDEX "ingest_jobs_schema_validation_schema_validation_approved_idx" ON "payload"."ingest_jobs" USING btree ("schema_validation_approved_by_id");
  CREATE INDEX "ingest_jobs_dataset_schema_version_idx" ON "payload"."ingest_jobs" USING btree ("dataset_schema_version_id");
  CREATE INDEX "ingest_jobs_updated_at_idx" ON "payload"."ingest_jobs" USING btree ("updated_at");
  CREATE INDEX "ingest_jobs_created_at_idx" ON "payload"."ingest_jobs" USING btree ("created_at");
  CREATE INDEX "ingest_jobs_deleted_at_idx" ON "payload"."ingest_jobs" USING btree ("deleted_at");
  CREATE INDEX "_ingest_jobs_v_version_errors_order_idx" ON "payload"."_ingest_jobs_v_version_errors" USING btree ("_order");
  CREATE INDEX "_ingest_jobs_v_version_errors_parent_id_idx" ON "payload"."_ingest_jobs_v_version_errors" USING btree ("_parent_id");
  CREATE INDEX "_ingest_jobs_v_parent_idx" ON "payload"."_ingest_jobs_v" USING btree ("parent_id");
  CREATE INDEX "_ingest_jobs_v_version_version_ingest_file_idx" ON "payload"."_ingest_jobs_v" USING btree ("version_ingest_file_id");
  CREATE INDEX "_ingest_jobs_v_version_version_dataset_idx" ON "payload"."_ingest_jobs_v" USING btree ("version_dataset_id");
  CREATE INDEX "_ingest_jobs_v_version_schema_validation_version_schema__idx" ON "payload"."_ingest_jobs_v" USING btree ("version_schema_validation_approved_by_id");
  CREATE INDEX "_ingest_jobs_v_version_version_dataset_schema_version_idx" ON "payload"."_ingest_jobs_v" USING btree ("version_dataset_schema_version_id");
  CREATE INDEX "_ingest_jobs_v_version_version_updated_at_idx" ON "payload"."_ingest_jobs_v" USING btree ("version_updated_at");
  CREATE INDEX "_ingest_jobs_v_version_version_created_at_idx" ON "payload"."_ingest_jobs_v" USING btree ("version_created_at");
  CREATE INDEX "_ingest_jobs_v_version_version_deleted_at_idx" ON "payload"."_ingest_jobs_v" USING btree ("version_deleted_at");
  CREATE INDEX "_ingest_jobs_v_created_at_idx" ON "payload"."_ingest_jobs_v" USING btree ("created_at");
  CREATE INDEX "_ingest_jobs_v_updated_at_idx" ON "payload"."_ingest_jobs_v" USING btree ("updated_at");
  CREATE INDEX "scheduled_ingests_multi_sheet_config_sheets_order_idx" ON "payload"."scheduled_ingests_multi_sheet_config_sheets" USING btree ("_order");
  CREATE INDEX "scheduled_ingests_multi_sheet_config_sheets_parent_id_idx" ON "payload"."scheduled_ingests_multi_sheet_config_sheets" USING btree ("_parent_id");
  CREATE INDEX "scheduled_ingests_multi_sheet_config_sheets_dataset_idx" ON "payload"."scheduled_ingests_multi_sheet_config_sheets" USING btree ("dataset_id");
  CREATE INDEX "scheduled_ingests_execution_history_order_idx" ON "payload"."scheduled_ingests_execution_history" USING btree ("_order");
  CREATE INDEX "scheduled_ingests_execution_history_parent_id_idx" ON "payload"."scheduled_ingests_execution_history" USING btree ("_parent_id");
  CREATE INDEX "scheduled_ingests_created_by_idx" ON "payload"."scheduled_ingests" USING btree ("created_by_id");
  CREATE INDEX "scheduled_ingests_catalog_idx" ON "payload"."scheduled_ingests" USING btree ("catalog_id");
  CREATE INDEX "scheduled_ingests_dataset_idx" ON "payload"."scheduled_ingests" USING btree ("dataset_id");
  CREATE INDEX "scheduled_ingests_source_ingest_file_idx" ON "payload"."scheduled_ingests" USING btree ("source_ingest_file_id");
  CREATE INDEX "scheduled_ingests_updated_at_idx" ON "payload"."scheduled_ingests" USING btree ("updated_at");
  CREATE INDEX "scheduled_ingests_created_at_idx" ON "payload"."scheduled_ingests" USING btree ("created_at");
  CREATE INDEX "scheduled_ingests_deleted_at_idx" ON "payload"."scheduled_ingests" USING btree ("deleted_at");
  CREATE INDEX "scheduled_ingests__status_idx" ON "payload"."scheduled_ingests" USING btree ("_status");
  CREATE INDEX "_scheduled_ingests_v_version_multi_sheet_config_sheets_order_idx" ON "payload"."_scheduled_ingests_v_version_multi_sheet_config_sheets" USING btree ("_order");
  CREATE INDEX "_scheduled_ingests_v_version_multi_sheet_config_sheets_parent_id_idx" ON "payload"."_scheduled_ingests_v_version_multi_sheet_config_sheets" USING btree ("_parent_id");
  CREATE INDEX "_scheduled_ingests_v_version_multi_sheet_config_sheets_d_idx" ON "payload"."_scheduled_ingests_v_version_multi_sheet_config_sheets" USING btree ("dataset_id");
  CREATE INDEX "_scheduled_ingests_v_version_execution_history_order_idx" ON "payload"."_scheduled_ingests_v_version_execution_history" USING btree ("_order");
  CREATE INDEX "_scheduled_ingests_v_version_execution_history_parent_id_idx" ON "payload"."_scheduled_ingests_v_version_execution_history" USING btree ("_parent_id");
  CREATE INDEX "_scheduled_ingests_v_parent_idx" ON "payload"."_scheduled_ingests_v" USING btree ("parent_id");
  CREATE INDEX "_scheduled_ingests_v_version_version_created_by_idx" ON "payload"."_scheduled_ingests_v" USING btree ("version_created_by_id");
  CREATE INDEX "_scheduled_ingests_v_version_version_catalog_idx" ON "payload"."_scheduled_ingests_v" USING btree ("version_catalog_id");
  CREATE INDEX "_scheduled_ingests_v_version_version_dataset_idx" ON "payload"."_scheduled_ingests_v" USING btree ("version_dataset_id");
  CREATE INDEX "_scheduled_ingests_v_version_version_source_ingest_file_idx" ON "payload"."_scheduled_ingests_v" USING btree ("version_source_ingest_file_id");
  CREATE INDEX "_scheduled_ingests_v_version_version_updated_at_idx" ON "payload"."_scheduled_ingests_v" USING btree ("version_updated_at");
  CREATE INDEX "_scheduled_ingests_v_version_version_created_at_idx" ON "payload"."_scheduled_ingests_v" USING btree ("version_created_at");
  CREATE INDEX "_scheduled_ingests_v_version_version_deleted_at_idx" ON "payload"."_scheduled_ingests_v" USING btree ("version_deleted_at");
  CREATE INDEX "_scheduled_ingests_v_version_version__status_idx" ON "payload"."_scheduled_ingests_v" USING btree ("version__status");
  CREATE INDEX "_scheduled_ingests_v_created_at_idx" ON "payload"."_scheduled_ingests_v" USING btree ("created_at");
  CREATE INDEX "_scheduled_ingests_v_updated_at_idx" ON "payload"."_scheduled_ingests_v" USING btree ("updated_at");
  CREATE INDEX "_scheduled_ingests_v_snapshot_idx" ON "payload"."_scheduled_ingests_v" USING btree ("snapshot");
  CREATE INDEX "_scheduled_ingests_v_published_locale_idx" ON "payload"."_scheduled_ingests_v" USING btree ("published_locale");
  CREATE INDEX "_scheduled_ingests_v_latest_idx" ON "payload"."_scheduled_ingests_v" USING btree ("latest");
  CREATE INDEX "_scheduled_ingests_v_autosave_idx" ON "payload"."_scheduled_ingests_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "scraper_repos_slug_idx" ON "payload"."scraper_repos" USING btree ("slug");
  CREATE INDEX "scraper_repos_created_by_idx" ON "payload"."scraper_repos" USING btree ("created_by_id");
  CREATE INDEX "scraper_repos_catalog_idx" ON "payload"."scraper_repos" USING btree ("catalog_id");
  CREATE INDEX "scraper_repos_updated_at_idx" ON "payload"."scraper_repos" USING btree ("updated_at");
  CREATE INDEX "scraper_repos_created_at_idx" ON "payload"."scraper_repos" USING btree ("created_at");
  CREATE INDEX "scraper_repos_deleted_at_idx" ON "payload"."scraper_repos" USING btree ("deleted_at");
  CREATE INDEX "scrapers_slug_idx" ON "payload"."scrapers" USING btree ("slug");
  CREATE INDEX "scrapers_repo_idx" ON "payload"."scrapers" USING btree ("repo_id");
  CREATE INDEX "scrapers_repo_created_by_idx" ON "payload"."scrapers" USING btree ("repo_created_by");
  CREATE INDEX "scrapers_target_dataset_idx" ON "payload"."scrapers" USING btree ("target_dataset_id");
  CREATE INDEX "scrapers_webhook_token_idx" ON "payload"."scrapers" USING btree ("webhook_token");
  CREATE INDEX "scrapers_updated_at_idx" ON "payload"."scrapers" USING btree ("updated_at");
  CREATE INDEX "scrapers_created_at_idx" ON "payload"."scrapers" USING btree ("created_at");
  CREATE INDEX "scrapers_deleted_at_idx" ON "payload"."scrapers" USING btree ("deleted_at");
  CREATE INDEX "scraper_runs_scraper_idx" ON "payload"."scraper_runs" USING btree ("scraper_id");
  CREATE INDEX "scraper_runs_scraper_owner_idx" ON "payload"."scraper_runs" USING btree ("scraper_owner");
  CREATE INDEX "scraper_runs_status_idx" ON "payload"."scraper_runs" USING btree ("status");
  CREATE INDEX "scraper_runs_result_file_idx" ON "payload"."scraper_runs" USING btree ("result_file_id");
  CREATE INDEX "scraper_runs_updated_at_idx" ON "payload"."scraper_runs" USING btree ("updated_at");
  CREATE INDEX "scraper_runs_created_at_idx" ON "payload"."scraper_runs" USING btree ("created_at");
  CREATE INDEX "events_dataset_idx" ON "payload"."events" USING btree ("dataset_id");
  CREATE INDEX "events_dataset_is_public_idx" ON "payload"."events" USING btree ("dataset_is_public");
  CREATE INDEX "events_catalog_owner_id_idx" ON "payload"."events" USING btree ("catalog_owner_id");
  CREATE INDEX "events_ingest_job_idx" ON "payload"."events" USING btree ("ingest_job_id");
  CREATE UNIQUE INDEX "events_unique_id_idx" ON "payload"."events" USING btree ("unique_id");
  CREATE INDEX "events_source_id_idx" ON "payload"."events" USING btree ("source_id");
  CREATE INDEX "events_content_hash_idx" ON "payload"."events" USING btree ("content_hash");
  CREATE INDEX "events_ingest_batch_idx" ON "payload"."events" USING btree ("ingest_batch");
  CREATE INDEX "events_validation_status_idx" ON "payload"."events" USING btree ("validation_status");
  CREATE INDEX "events_updated_at_idx" ON "payload"."events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "payload"."events" USING btree ("created_at");
  CREATE INDEX "events_deleted_at_idx" ON "payload"."events" USING btree ("deleted_at");
  CREATE INDEX "events__status_idx" ON "payload"."events" USING btree ("_status");
  CREATE INDEX "dataset_eventTimestamp_idx" ON "payload"."events" USING btree ("dataset_id","event_timestamp");
  CREATE INDEX "eventTimestamp_idx" ON "payload"."events" USING btree ("event_timestamp");
  CREATE INDEX "uniqueId_idx" ON "payload"."events" USING btree ("unique_id");
  CREATE INDEX "dataset_contentHash_idx" ON "payload"."events" USING btree ("dataset_id","content_hash");
  CREATE INDEX "ingestJob_ingestBatch_idx" ON "payload"."events" USING btree ("ingest_job_id","ingest_batch");
  CREATE INDEX "validationStatus_idx" ON "payload"."events" USING btree ("validation_status");
  CREATE INDEX "location_longitude_idx" ON "payload"."events" USING btree ("location_longitude");
  CREATE INDEX "location_latitude_idx" ON "payload"."events" USING btree ("location_latitude");
  CREATE INDEX "_events_v_parent_idx" ON "payload"."_events_v" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_version_dataset_idx" ON "payload"."_events_v" USING btree ("version_dataset_id");
  CREATE INDEX "_events_v_version_version_dataset_is_public_idx" ON "payload"."_events_v" USING btree ("version_dataset_is_public");
  CREATE INDEX "_events_v_version_version_catalog_owner_id_idx" ON "payload"."_events_v" USING btree ("version_catalog_owner_id");
  CREATE INDEX "_events_v_version_version_ingest_job_idx" ON "payload"."_events_v" USING btree ("version_ingest_job_id");
  CREATE INDEX "_events_v_version_version_unique_id_idx" ON "payload"."_events_v" USING btree ("version_unique_id");
  CREATE INDEX "_events_v_version_version_source_id_idx" ON "payload"."_events_v" USING btree ("version_source_id");
  CREATE INDEX "_events_v_version_version_content_hash_idx" ON "payload"."_events_v" USING btree ("version_content_hash");
  CREATE INDEX "_events_v_version_version_ingest_batch_idx" ON "payload"."_events_v" USING btree ("version_ingest_batch");
  CREATE INDEX "_events_v_version_version_validation_status_idx" ON "payload"."_events_v" USING btree ("version_validation_status");
  CREATE INDEX "_events_v_version_version_updated_at_idx" ON "payload"."_events_v" USING btree ("version_updated_at");
  CREATE INDEX "_events_v_version_version_created_at_idx" ON "payload"."_events_v" USING btree ("version_created_at");
  CREATE INDEX "_events_v_version_version_deleted_at_idx" ON "payload"."_events_v" USING btree ("version_deleted_at");
  CREATE INDEX "_events_v_version_version__status_idx" ON "payload"."_events_v" USING btree ("version__status");
  CREATE INDEX "_events_v_created_at_idx" ON "payload"."_events_v" USING btree ("created_at");
  CREATE INDEX "_events_v_updated_at_idx" ON "payload"."_events_v" USING btree ("updated_at");
  CREATE INDEX "_events_v_snapshot_idx" ON "payload"."_events_v" USING btree ("snapshot");
  CREATE INDEX "_events_v_published_locale_idx" ON "payload"."_events_v" USING btree ("published_locale");
  CREATE INDEX "_events_v_latest_idx" ON "payload"."_events_v" USING btree ("latest");
  CREATE INDEX "_events_v_autosave_idx" ON "payload"."_events_v" USING btree ("autosave");
  CREATE INDEX "version_dataset_version_eventTimestamp_idx" ON "payload"."_events_v" USING btree ("version_dataset_id","version_event_timestamp");
  CREATE INDEX "version_eventTimestamp_idx" ON "payload"."_events_v" USING btree ("version_event_timestamp");
  CREATE INDEX "version_uniqueId_idx" ON "payload"."_events_v" USING btree ("version_unique_id");
  CREATE INDEX "version_dataset_version_contentHash_idx" ON "payload"."_events_v" USING btree ("version_dataset_id","version_content_hash");
  CREATE INDEX "version_ingestJob_version_ingestBatch_idx" ON "payload"."_events_v" USING btree ("version_ingest_job_id","version_ingest_batch");
  CREATE INDEX "version_validationStatus_idx" ON "payload"."_events_v" USING btree ("version_validation_status");
  CREATE INDEX "version_location_longitude_idx" ON "payload"."_events_v" USING btree ("version_location_longitude");
  CREATE INDEX "version_location_latitude_idx" ON "payload"."_events_v" USING btree ("version_location_latitude");
  CREATE INDEX "users_sessions_order_idx" ON "payload"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "payload"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "payload"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "payload"."users" USING btree ("created_at");
  CREATE INDEX "users_deleted_at_idx" ON "payload"."users" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "payload"."users" USING btree ("email");
  CREATE UNIQUE INDEX "user_usage_user_idx" ON "payload"."user_usage" USING btree ("user_id");
  CREATE INDEX "user_usage_last_reset_date_idx" ON "payload"."user_usage" USING btree ("last_reset_date");
  CREATE INDEX "user_usage_updated_at_idx" ON "payload"."user_usage" USING btree ("updated_at");
  CREATE INDEX "user_usage_created_at_idx" ON "payload"."user_usage" USING btree ("created_at");
  CREATE INDEX "user_usage_deleted_at_idx" ON "payload"."user_usage" USING btree ("deleted_at");
  CREATE INDEX "media_created_by_idx" ON "payload"."media" USING btree ("created_by_id");
  CREATE INDEX "media_updated_at_idx" ON "payload"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "payload"."media" USING btree ("created_at");
  CREATE INDEX "media_deleted_at_idx" ON "payload"."media" USING btree ("deleted_at");
  CREATE INDEX "media__status_idx" ON "payload"."media" USING btree ("_status");
  CREATE UNIQUE INDEX "media_filename_idx" ON "payload"."media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "payload"."media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "payload"."media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_tablet_sizes_tablet_filename_idx" ON "payload"."media" USING btree ("sizes_tablet_filename");
  CREATE INDEX "_media_v_parent_idx" ON "payload"."_media_v" USING btree ("parent_id");
  CREATE INDEX "_media_v_version_version_created_by_idx" ON "payload"."_media_v" USING btree ("version_created_by_id");
  CREATE INDEX "_media_v_version_version_updated_at_idx" ON "payload"."_media_v" USING btree ("version_updated_at");
  CREATE INDEX "_media_v_version_version_created_at_idx" ON "payload"."_media_v" USING btree ("version_created_at");
  CREATE INDEX "_media_v_version_version_deleted_at_idx" ON "payload"."_media_v" USING btree ("version_deleted_at");
  CREATE INDEX "_media_v_version_version__status_idx" ON "payload"."_media_v" USING btree ("version__status");
  CREATE INDEX "_media_v_version_version_filename_idx" ON "payload"."_media_v" USING btree ("version_filename");
  CREATE INDEX "_media_v_version_sizes_thumbnail_version_sizes_thumbnail_idx" ON "payload"."_media_v" USING btree ("version_sizes_thumbnail_filename");
  CREATE INDEX "_media_v_version_sizes_card_version_sizes_card_filename_idx" ON "payload"."_media_v" USING btree ("version_sizes_card_filename");
  CREATE INDEX "_media_v_version_sizes_tablet_version_sizes_tablet_filen_idx" ON "payload"."_media_v" USING btree ("version_sizes_tablet_filename");
  CREATE INDEX "_media_v_created_at_idx" ON "payload"."_media_v" USING btree ("created_at");
  CREATE INDEX "_media_v_updated_at_idx" ON "payload"."_media_v" USING btree ("updated_at");
  CREATE INDEX "_media_v_snapshot_idx" ON "payload"."_media_v" USING btree ("snapshot");
  CREATE INDEX "_media_v_published_locale_idx" ON "payload"."_media_v" USING btree ("published_locale");
  CREATE INDEX "_media_v_latest_idx" ON "payload"."_media_v" USING btree ("latest");
  CREATE INDEX "_media_v_autosave_idx" ON "payload"."_media_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "location_cache_original_address_idx" ON "payload"."location_cache" USING btree ("original_address");
  CREATE INDEX "location_cache_normalized_address_idx" ON "payload"."location_cache" USING btree ("normalized_address");
  CREATE INDEX "location_cache_updated_at_idx" ON "payload"."location_cache" USING btree ("updated_at");
  CREATE INDEX "location_cache_created_at_idx" ON "payload"."location_cache" USING btree ("created_at");
  CREATE INDEX "location_cache_deleted_at_idx" ON "payload"."location_cache" USING btree ("deleted_at");
  CREATE INDEX "location_cache__status_idx" ON "payload"."location_cache" USING btree ("_status");
  CREATE INDEX "_location_cache_v_parent_idx" ON "payload"."_location_cache_v" USING btree ("parent_id");
  CREATE INDEX "_location_cache_v_version_version_original_address_idx" ON "payload"."_location_cache_v" USING btree ("version_original_address");
  CREATE INDEX "_location_cache_v_version_version_normalized_address_idx" ON "payload"."_location_cache_v" USING btree ("version_normalized_address");
  CREATE INDEX "_location_cache_v_version_version_updated_at_idx" ON "payload"."_location_cache_v" USING btree ("version_updated_at");
  CREATE INDEX "_location_cache_v_version_version_created_at_idx" ON "payload"."_location_cache_v" USING btree ("version_created_at");
  CREATE INDEX "_location_cache_v_version_version_deleted_at_idx" ON "payload"."_location_cache_v" USING btree ("version_deleted_at");
  CREATE INDEX "_location_cache_v_version_version__status_idx" ON "payload"."_location_cache_v" USING btree ("version__status");
  CREATE INDEX "_location_cache_v_created_at_idx" ON "payload"."_location_cache_v" USING btree ("created_at");
  CREATE INDEX "_location_cache_v_updated_at_idx" ON "payload"."_location_cache_v" USING btree ("updated_at");
  CREATE INDEX "_location_cache_v_snapshot_idx" ON "payload"."_location_cache_v" USING btree ("snapshot");
  CREATE INDEX "_location_cache_v_published_locale_idx" ON "payload"."_location_cache_v" USING btree ("published_locale");
  CREATE INDEX "_location_cache_v_latest_idx" ON "payload"."_location_cache_v" USING btree ("latest");
  CREATE INDEX "_location_cache_v_autosave_idx" ON "payload"."_location_cache_v" USING btree ("autosave");
  CREATE INDEX "geocoding_providers_tags_order_idx" ON "payload"."geocoding_providers_tags" USING btree ("order");
  CREATE INDEX "geocoding_providers_tags_parent_idx" ON "payload"."geocoding_providers_tags" USING btree ("parent_id");
  CREATE UNIQUE INDEX "geocoding_providers_name_idx" ON "payload"."geocoding_providers" USING btree ("name");
  CREATE INDEX "geocoding_providers_updated_at_idx" ON "payload"."geocoding_providers" USING btree ("updated_at");
  CREATE INDEX "geocoding_providers_created_at_idx" ON "payload"."geocoding_providers" USING btree ("created_at");
  CREATE INDEX "geocoding_providers_deleted_at_idx" ON "payload"."geocoding_providers" USING btree ("deleted_at");
  CREATE INDEX "geocoding_providers__status_idx" ON "payload"."geocoding_providers" USING btree ("_status");
  CREATE INDEX "_geocoding_providers_v_version_tags_order_idx" ON "payload"."_geocoding_providers_v_version_tags" USING btree ("order");
  CREATE INDEX "_geocoding_providers_v_version_tags_parent_idx" ON "payload"."_geocoding_providers_v_version_tags" USING btree ("parent_id");
  CREATE INDEX "_geocoding_providers_v_parent_idx" ON "payload"."_geocoding_providers_v" USING btree ("parent_id");
  CREATE INDEX "_geocoding_providers_v_version_version_name_idx" ON "payload"."_geocoding_providers_v" USING btree ("version_name");
  CREATE INDEX "_geocoding_providers_v_version_version_updated_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("version_updated_at");
  CREATE INDEX "_geocoding_providers_v_version_version_created_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("version_created_at");
  CREATE INDEX "_geocoding_providers_v_version_version_deleted_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("version_deleted_at");
  CREATE INDEX "_geocoding_providers_v_version_version__status_idx" ON "payload"."_geocoding_providers_v" USING btree ("version__status");
  CREATE INDEX "_geocoding_providers_v_created_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("created_at");
  CREATE INDEX "_geocoding_providers_v_updated_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("updated_at");
  CREATE INDEX "_geocoding_providers_v_snapshot_idx" ON "payload"."_geocoding_providers_v" USING btree ("snapshot");
  CREATE INDEX "_geocoding_providers_v_published_locale_idx" ON "payload"."_geocoding_providers_v" USING btree ("published_locale");
  CREATE INDEX "_geocoding_providers_v_latest_idx" ON "payload"."_geocoding_providers_v" USING btree ("latest");
  CREATE INDEX "_geocoding_providers_v_autosave_idx" ON "payload"."_geocoding_providers_v" USING btree ("autosave");
  CREATE INDEX "pages_blocks_hero_buttons_order_idx" ON "payload"."pages_blocks_hero_buttons" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_buttons_parent_id_idx" ON "payload"."pages_blocks_hero_buttons" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_hero_buttons_locales_locale_parent_id_unique" ON "payload"."pages_blocks_hero_buttons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_hero_order_idx" ON "payload"."pages_blocks_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_parent_id_idx" ON "payload"."pages_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_path_idx" ON "payload"."pages_blocks_hero" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_hero_locales_locale_parent_id_unique" ON "payload"."pages_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_features_features_order_idx" ON "payload"."pages_blocks_features_features" USING btree ("_order");
  CREATE INDEX "pages_blocks_features_features_parent_id_idx" ON "payload"."pages_blocks_features_features" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_features_features_locales_locale_parent_id_uniq" ON "payload"."pages_blocks_features_features_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_features_order_idx" ON "payload"."pages_blocks_features" USING btree ("_order");
  CREATE INDEX "pages_blocks_features_parent_id_idx" ON "payload"."pages_blocks_features" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_features_path_idx" ON "payload"."pages_blocks_features" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_features_locales_locale_parent_id_unique" ON "payload"."pages_blocks_features_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_stats_stats_order_idx" ON "payload"."pages_blocks_stats_stats" USING btree ("_order");
  CREATE INDEX "pages_blocks_stats_stats_parent_id_idx" ON "payload"."pages_blocks_stats_stats" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_stats_stats_locales_locale_parent_id_unique" ON "payload"."pages_blocks_stats_stats_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_stats_order_idx" ON "payload"."pages_blocks_stats" USING btree ("_order");
  CREATE INDEX "pages_blocks_stats_parent_id_idx" ON "payload"."pages_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_stats_path_idx" ON "payload"."pages_blocks_stats" USING btree ("_path");
  CREATE INDEX "pages_blocks_details_grid_items_order_idx" ON "payload"."pages_blocks_details_grid_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_details_grid_items_parent_id_idx" ON "payload"."pages_blocks_details_grid_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_details_grid_items_locales_locale_parent_id_uni" ON "payload"."pages_blocks_details_grid_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_details_grid_order_idx" ON "payload"."pages_blocks_details_grid" USING btree ("_order");
  CREATE INDEX "pages_blocks_details_grid_parent_id_idx" ON "payload"."pages_blocks_details_grid" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_details_grid_path_idx" ON "payload"."pages_blocks_details_grid" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_details_grid_locales_locale_parent_id_unique" ON "payload"."pages_blocks_details_grid_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_timeline_items_order_idx" ON "payload"."pages_blocks_timeline_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_timeline_items_parent_id_idx" ON "payload"."pages_blocks_timeline_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_timeline_items_locales_locale_parent_id_unique" ON "payload"."pages_blocks_timeline_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_timeline_order_idx" ON "payload"."pages_blocks_timeline" USING btree ("_order");
  CREATE INDEX "pages_blocks_timeline_parent_id_idx" ON "payload"."pages_blocks_timeline" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_timeline_path_idx" ON "payload"."pages_blocks_timeline" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_timeline_locales_locale_parent_id_unique" ON "payload"."pages_blocks_timeline_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_testimonials_items_order_idx" ON "payload"."pages_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonials_items_parent_id_idx" ON "payload"."pages_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_testimonials_items_locales_locale_parent_id_uni" ON "payload"."pages_blocks_testimonials_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_testimonials_order_idx" ON "payload"."pages_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonials_parent_id_idx" ON "payload"."pages_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonials_path_idx" ON "payload"."pages_blocks_testimonials" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_testimonials_locales_locale_parent_id_unique" ON "payload"."pages_blocks_testimonials_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_rich_text_order_idx" ON "payload"."pages_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_rich_text_parent_id_idx" ON "payload"."pages_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_rich_text_path_idx" ON "payload"."pages_blocks_rich_text" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_rich_text_locales_locale_parent_id_unique" ON "payload"."pages_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_cta_order_idx" ON "payload"."pages_blocks_cta" USING btree ("_order");
  CREATE INDEX "pages_blocks_cta_parent_id_idx" ON "payload"."pages_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_cta_path_idx" ON "payload"."pages_blocks_cta" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_cta_locales_locale_parent_id_unique" ON "payload"."pages_blocks_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_newsletter_form_order_idx" ON "payload"."pages_blocks_newsletter_form" USING btree ("_order");
  CREATE INDEX "pages_blocks_newsletter_form_parent_id_idx" ON "payload"."pages_blocks_newsletter_form" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_newsletter_form_path_idx" ON "payload"."pages_blocks_newsletter_form" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_newsletter_form_locales_locale_parent_id_unique" ON "payload"."pages_blocks_newsletter_form_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_newsletter_c_t_a_order_idx" ON "payload"."pages_blocks_newsletter_c_t_a" USING btree ("_order");
  CREATE INDEX "pages_blocks_newsletter_c_t_a_parent_id_idx" ON "payload"."pages_blocks_newsletter_c_t_a" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_newsletter_c_t_a_path_idx" ON "payload"."pages_blocks_newsletter_c_t_a" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_newsletter_c_t_a_locales_locale_parent_id_uniqu" ON "payload"."pages_blocks_newsletter_c_t_a_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "payload"."pages" USING btree ("slug");
  CREATE INDEX "pages_site_idx" ON "payload"."pages" USING btree ("site_id");
  CREATE INDEX "pages_layout_override_idx" ON "payload"."pages" USING btree ("layout_override_id");
  CREATE INDEX "pages_created_by_idx" ON "payload"."pages" USING btree ("created_by_id");
  CREATE INDEX "pages_updated_at_idx" ON "payload"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "payload"."pages" USING btree ("created_at");
  CREATE INDEX "pages_deleted_at_idx" ON "payload"."pages" USING btree ("deleted_at");
  CREATE INDEX "pages__status_idx" ON "payload"."pages" USING btree ("_status");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "payload"."pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_buttons_order_idx" ON "payload"."_pages_v_blocks_hero_buttons" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_buttons_parent_id_idx" ON "payload"."_pages_v_blocks_hero_buttons" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_hero_buttons_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_hero_buttons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_order_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_parent_id_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_path_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_hero_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_features_features_order_idx" ON "payload"."_pages_v_blocks_features_features" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_features_features_parent_id_idx" ON "payload"."_pages_v_blocks_features_features" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_features_features_locales_locale_parent_id_u" ON "payload"."_pages_v_blocks_features_features_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_features_order_idx" ON "payload"."_pages_v_blocks_features" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_features_parent_id_idx" ON "payload"."_pages_v_blocks_features" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_features_path_idx" ON "payload"."_pages_v_blocks_features" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_features_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_features_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_stats_stats_order_idx" ON "payload"."_pages_v_blocks_stats_stats" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stats_stats_parent_id_idx" ON "payload"."_pages_v_blocks_stats_stats" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_stats_stats_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_stats_stats_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_stats_order_idx" ON "payload"."_pages_v_blocks_stats" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stats_parent_id_idx" ON "payload"."_pages_v_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_stats_path_idx" ON "payload"."_pages_v_blocks_stats" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_details_grid_items_order_idx" ON "payload"."_pages_v_blocks_details_grid_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_details_grid_items_parent_id_idx" ON "payload"."_pages_v_blocks_details_grid_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_details_grid_items_locales_locale_parent_id_" ON "payload"."_pages_v_blocks_details_grid_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_details_grid_order_idx" ON "payload"."_pages_v_blocks_details_grid" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_details_grid_parent_id_idx" ON "payload"."_pages_v_blocks_details_grid" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_details_grid_path_idx" ON "payload"."_pages_v_blocks_details_grid" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_details_grid_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_details_grid_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_items_order_idx" ON "payload"."_pages_v_blocks_timeline_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_timeline_items_parent_id_idx" ON "payload"."_pages_v_blocks_timeline_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_timeline_items_locales_locale_parent_id_uniq" ON "payload"."_pages_v_blocks_timeline_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_order_idx" ON "payload"."_pages_v_blocks_timeline" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_timeline_parent_id_idx" ON "payload"."_pages_v_blocks_timeline" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_path_idx" ON "payload"."_pages_v_blocks_timeline" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_timeline_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_timeline_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_items_order_idx" ON "payload"."_pages_v_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonials_items_parent_id_idx" ON "payload"."_pages_v_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_testimonials_items_locales_locale_parent_id_" ON "payload"."_pages_v_blocks_testimonials_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_order_idx" ON "payload"."_pages_v_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonials_parent_id_idx" ON "payload"."_pages_v_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_path_idx" ON "payload"."_pages_v_blocks_testimonials" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_testimonials_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_testimonials_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_order_idx" ON "payload"."_pages_v_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_rich_text_parent_id_idx" ON "payload"."_pages_v_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_path_idx" ON "payload"."_pages_v_blocks_rich_text" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_rich_text_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_order_idx" ON "payload"."_pages_v_blocks_cta" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_cta_parent_id_idx" ON "payload"."_pages_v_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_path_idx" ON "payload"."_pages_v_blocks_cta" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_cta_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_newsletter_form_order_idx" ON "payload"."_pages_v_blocks_newsletter_form" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_newsletter_form_parent_id_idx" ON "payload"."_pages_v_blocks_newsletter_form" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_newsletter_form_path_idx" ON "payload"."_pages_v_blocks_newsletter_form" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_newsletter_form_locales_locale_parent_id_uni" ON "payload"."_pages_v_blocks_newsletter_form_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_newsletter_c_t_a_order_idx" ON "payload"."_pages_v_blocks_newsletter_c_t_a" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_newsletter_c_t_a_parent_id_idx" ON "payload"."_pages_v_blocks_newsletter_c_t_a" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_newsletter_c_t_a_path_idx" ON "payload"."_pages_v_blocks_newsletter_c_t_a" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_newsletter_c_t_a_locales_locale_parent_id_un" ON "payload"."_pages_v_blocks_newsletter_c_t_a_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "payload"."_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "payload"."_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_site_idx" ON "payload"."_pages_v" USING btree ("version_site_id");
  CREATE INDEX "_pages_v_version_version_layout_override_idx" ON "payload"."_pages_v" USING btree ("version_layout_override_id");
  CREATE INDEX "_pages_v_version_version_created_by_idx" ON "payload"."_pages_v" USING btree ("version_created_by_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "payload"."_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "payload"."_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version_deleted_at_idx" ON "payload"."_pages_v" USING btree ("version_deleted_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "payload"."_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "payload"."_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "payload"."_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "payload"."_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "payload"."_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "payload"."_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "payload"."_pages_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "payload"."_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "sites_slug_idx" ON "payload"."sites" USING btree ("slug");
  CREATE UNIQUE INDEX "sites_domain_idx" ON "payload"."sites" USING btree ("domain");
  CREATE INDEX "sites_branding_branding_logo_idx" ON "payload"."sites" USING btree ("branding_logo_id");
  CREATE INDEX "sites_branding_branding_logo_dark_idx" ON "payload"."sites" USING btree ("branding_logo_dark_id");
  CREATE INDEX "sites_branding_branding_favicon_idx" ON "payload"."sites" USING btree ("branding_favicon_id");
  CREATE INDEX "sites_branding_branding_theme_idx" ON "payload"."sites" USING btree ("branding_theme_id");
  CREATE INDEX "sites_default_layout_idx" ON "payload"."sites" USING btree ("default_layout_id");
  CREATE INDEX "sites_created_by_idx" ON "payload"."sites" USING btree ("created_by_id");
  CREATE INDEX "sites_updated_at_idx" ON "payload"."sites" USING btree ("updated_at");
  CREATE INDEX "sites_created_at_idx" ON "payload"."sites" USING btree ("created_at");
  CREATE INDEX "sites_deleted_at_idx" ON "payload"."sites" USING btree ("deleted_at");
  CREATE INDEX "sites__status_idx" ON "payload"."sites" USING btree ("_status");
  CREATE INDEX "_sites_v_parent_idx" ON "payload"."_sites_v" USING btree ("parent_id");
  CREATE INDEX "_sites_v_version_version_slug_idx" ON "payload"."_sites_v" USING btree ("version_slug");
  CREATE INDEX "_sites_v_version_version_domain_idx" ON "payload"."_sites_v" USING btree ("version_domain");
  CREATE INDEX "_sites_v_version_branding_version_branding_logo_idx" ON "payload"."_sites_v" USING btree ("version_branding_logo_id");
  CREATE INDEX "_sites_v_version_branding_version_branding_logo_dark_idx" ON "payload"."_sites_v" USING btree ("version_branding_logo_dark_id");
  CREATE INDEX "_sites_v_version_branding_version_branding_favicon_idx" ON "payload"."_sites_v" USING btree ("version_branding_favicon_id");
  CREATE INDEX "_sites_v_version_branding_version_branding_theme_idx" ON "payload"."_sites_v" USING btree ("version_branding_theme_id");
  CREATE INDEX "_sites_v_version_version_default_layout_idx" ON "payload"."_sites_v" USING btree ("version_default_layout_id");
  CREATE INDEX "_sites_v_version_version_created_by_idx" ON "payload"."_sites_v" USING btree ("version_created_by_id");
  CREATE INDEX "_sites_v_version_version_updated_at_idx" ON "payload"."_sites_v" USING btree ("version_updated_at");
  CREATE INDEX "_sites_v_version_version_created_at_idx" ON "payload"."_sites_v" USING btree ("version_created_at");
  CREATE INDEX "_sites_v_version_version_deleted_at_idx" ON "payload"."_sites_v" USING btree ("version_deleted_at");
  CREATE INDEX "_sites_v_version_version__status_idx" ON "payload"."_sites_v" USING btree ("version__status");
  CREATE INDEX "_sites_v_created_at_idx" ON "payload"."_sites_v" USING btree ("created_at");
  CREATE INDEX "_sites_v_updated_at_idx" ON "payload"."_sites_v" USING btree ("updated_at");
  CREATE INDEX "_sites_v_snapshot_idx" ON "payload"."_sites_v" USING btree ("snapshot");
  CREATE INDEX "_sites_v_published_locale_idx" ON "payload"."_sites_v" USING btree ("published_locale");
  CREATE INDEX "_sites_v_latest_idx" ON "payload"."_sites_v" USING btree ("latest");
  CREATE INDEX "_sites_v_autosave_idx" ON "payload"."_sites_v" USING btree ("autosave");
  CREATE INDEX "themes_created_by_idx" ON "payload"."themes" USING btree ("created_by_id");
  CREATE INDEX "themes_updated_at_idx" ON "payload"."themes" USING btree ("updated_at");
  CREATE INDEX "themes_created_at_idx" ON "payload"."themes" USING btree ("created_at");
  CREATE INDEX "themes_deleted_at_idx" ON "payload"."themes" USING btree ("deleted_at");
  CREATE INDEX "themes__status_idx" ON "payload"."themes" USING btree ("_status");
  CREATE INDEX "_themes_v_parent_idx" ON "payload"."_themes_v" USING btree ("parent_id");
  CREATE INDEX "_themes_v_version_version_created_by_idx" ON "payload"."_themes_v" USING btree ("version_created_by_id");
  CREATE INDEX "_themes_v_version_version_updated_at_idx" ON "payload"."_themes_v" USING btree ("version_updated_at");
  CREATE INDEX "_themes_v_version_version_created_at_idx" ON "payload"."_themes_v" USING btree ("version_created_at");
  CREATE INDEX "_themes_v_version_version_deleted_at_idx" ON "payload"."_themes_v" USING btree ("version_deleted_at");
  CREATE INDEX "_themes_v_version_version__status_idx" ON "payload"."_themes_v" USING btree ("version__status");
  CREATE INDEX "_themes_v_created_at_idx" ON "payload"."_themes_v" USING btree ("created_at");
  CREATE INDEX "_themes_v_updated_at_idx" ON "payload"."_themes_v" USING btree ("updated_at");
  CREATE INDEX "_themes_v_snapshot_idx" ON "payload"."_themes_v" USING btree ("snapshot");
  CREATE INDEX "_themes_v_published_locale_idx" ON "payload"."_themes_v" USING btree ("published_locale");
  CREATE INDEX "_themes_v_latest_idx" ON "payload"."_themes_v" USING btree ("latest");
  CREATE INDEX "_themes_v_autosave_idx" ON "payload"."_themes_v" USING btree ("autosave");
  CREATE INDEX "layout_templates_created_by_idx" ON "payload"."layout_templates" USING btree ("created_by_id");
  CREATE INDEX "layout_templates_updated_at_idx" ON "payload"."layout_templates" USING btree ("updated_at");
  CREATE INDEX "layout_templates_created_at_idx" ON "payload"."layout_templates" USING btree ("created_at");
  CREATE INDEX "layout_templates_deleted_at_idx" ON "payload"."layout_templates" USING btree ("deleted_at");
  CREATE INDEX "layout_templates__status_idx" ON "payload"."layout_templates" USING btree ("_status");
  CREATE INDEX "_layout_templates_v_parent_idx" ON "payload"."_layout_templates_v" USING btree ("parent_id");
  CREATE INDEX "_layout_templates_v_version_version_created_by_idx" ON "payload"."_layout_templates_v" USING btree ("version_created_by_id");
  CREATE INDEX "_layout_templates_v_version_version_updated_at_idx" ON "payload"."_layout_templates_v" USING btree ("version_updated_at");
  CREATE INDEX "_layout_templates_v_version_version_created_at_idx" ON "payload"."_layout_templates_v" USING btree ("version_created_at");
  CREATE INDEX "_layout_templates_v_version_version_deleted_at_idx" ON "payload"."_layout_templates_v" USING btree ("version_deleted_at");
  CREATE INDEX "_layout_templates_v_version_version__status_idx" ON "payload"."_layout_templates_v" USING btree ("version__status");
  CREATE INDEX "_layout_templates_v_created_at_idx" ON "payload"."_layout_templates_v" USING btree ("created_at");
  CREATE INDEX "_layout_templates_v_updated_at_idx" ON "payload"."_layout_templates_v" USING btree ("updated_at");
  CREATE INDEX "_layout_templates_v_snapshot_idx" ON "payload"."_layout_templates_v" USING btree ("snapshot");
  CREATE INDEX "_layout_templates_v_published_locale_idx" ON "payload"."_layout_templates_v" USING btree ("published_locale");
  CREATE INDEX "_layout_templates_v_latest_idx" ON "payload"."_layout_templates_v" USING btree ("latest");
  CREATE INDEX "_layout_templates_v_autosave_idx" ON "payload"."_layout_templates_v" USING btree ("autosave");
  CREATE INDEX "views_filter_config_fields_order_idx" ON "payload"."views_filter_config_fields" USING btree ("_order");
  CREATE INDEX "views_filter_config_fields_parent_id_idx" ON "payload"."views_filter_config_fields" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "views_slug_idx" ON "payload"."views" USING btree ("slug");
  CREATE INDEX "views_site_idx" ON "payload"."views" USING btree ("site_id");
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
  CREATE INDEX "_views_v_version_version_site_idx" ON "payload"."_views_v" USING btree ("version_site_id");
  CREATE INDEX "_views_v_version_version_created_by_idx" ON "payload"."_views_v" USING btree ("version_created_by_id");
  CREATE INDEX "_views_v_version_version_updated_at_idx" ON "payload"."_views_v" USING btree ("version_updated_at");
  CREATE INDEX "_views_v_version_version_created_at_idx" ON "payload"."_views_v" USING btree ("version_created_at");
  CREATE INDEX "_views_v_version_version_deleted_at_idx" ON "payload"."_views_v" USING btree ("version_deleted_at");
  CREATE INDEX "_views_v_version_version__status_idx" ON "payload"."_views_v" USING btree ("version__status");
  CREATE INDEX "_views_v_created_at_idx" ON "payload"."_views_v" USING btree ("created_at");
  CREATE INDEX "_views_v_updated_at_idx" ON "payload"."_views_v" USING btree ("updated_at");
  CREATE INDEX "_views_v_snapshot_idx" ON "payload"."_views_v" USING btree ("snapshot");
  CREATE INDEX "_views_v_published_locale_idx" ON "payload"."_views_v" USING btree ("published_locale");
  CREATE INDEX "_views_v_latest_idx" ON "payload"."_views_v" USING btree ("latest");
  CREATE INDEX "_views_v_autosave_idx" ON "payload"."_views_v" USING btree ("autosave");
  CREATE INDEX "_views_v_rels_order_idx" ON "payload"."_views_v_rels" USING btree ("order");
  CREATE INDEX "_views_v_rels_parent_idx" ON "payload"."_views_v_rels" USING btree ("parent_id");
  CREATE INDEX "_views_v_rels_path_idx" ON "payload"."_views_v_rels" USING btree ("path");
  CREATE INDEX "_views_v_rels_catalogs_id_idx" ON "payload"."_views_v_rels" USING btree ("catalogs_id");
  CREATE INDEX "_views_v_rels_datasets_id_idx" ON "payload"."_views_v_rels" USING btree ("datasets_id");
  CREATE UNIQUE INDEX "schema_detectors_name_idx" ON "payload"."schema_detectors" USING btree ("name");
  CREATE INDEX "schema_detectors_updated_at_idx" ON "payload"."schema_detectors" USING btree ("updated_at");
  CREATE INDEX "schema_detectors_created_at_idx" ON "payload"."schema_detectors" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload"."payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload"."payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload"."payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload"."payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload"."payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload"."payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload"."payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload"."payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload"."payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload"."payload_jobs" USING btree ("concurrency_key");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload"."payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload"."payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_catalogs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("catalogs_id");
  CREATE INDEX "payload_locked_documents_rels_data_exports_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("data_exports_id");
  CREATE INDEX "payload_locked_documents_rels_datasets_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("datasets_id");
  CREATE INDEX "payload_locked_documents_rels_dataset_schemas_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("dataset_schemas_id");
  CREATE INDEX "payload_locked_documents_rels_audit_log_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("audit_log_id");
  CREATE INDEX "payload_locked_documents_rels_ingest_files_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("ingest_files_id");
  CREATE INDEX "payload_locked_documents_rels_ingest_jobs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("ingest_jobs_id");
  CREATE INDEX "payload_locked_documents_rels_scheduled_ingests_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("scheduled_ingests_id");
  CREATE INDEX "payload_locked_documents_rels_scraper_repos_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("scraper_repos_id");
  CREATE INDEX "payload_locked_documents_rels_scrapers_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("scrapers_id");
  CREATE INDEX "payload_locked_documents_rels_scraper_runs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("scraper_runs_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_user_usage_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("user_usage_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_location_cache_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("location_cache_id");
  CREATE INDEX "payload_locked_documents_rels_geocoding_providers_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("geocoding_providers_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_sites_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("sites_id");
  CREATE INDEX "payload_locked_documents_rels_themes_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("themes_id");
  CREATE INDEX "payload_locked_documents_rels_layout_templates_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("layout_templates_id");
  CREATE INDEX "payload_locked_documents_rels_views_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("views_id");
  CREATE INDEX "payload_locked_documents_rels_schema_detectors_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("schema_detectors_id");
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
  CREATE INDEX "main_menu_nav_items_parent_id_idx" ON "payload"."main_menu_nav_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "main_menu_nav_items_locales_locale_parent_id_unique" ON "payload"."main_menu_nav_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "main_menu__status_idx" ON "payload"."main_menu" USING btree ("_status");
  CREATE INDEX "_main_menu_v_version_nav_items_order_idx" ON "payload"."_main_menu_v_version_nav_items" USING btree ("_order");
  CREATE INDEX "_main_menu_v_version_nav_items_parent_id_idx" ON "payload"."_main_menu_v_version_nav_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_main_menu_v_version_nav_items_locales_locale_parent_id_uniq" ON "payload"."_main_menu_v_version_nav_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_main_menu_v_version_version__status_idx" ON "payload"."_main_menu_v" USING btree ("version__status");
  CREATE INDEX "_main_menu_v_created_at_idx" ON "payload"."_main_menu_v" USING btree ("created_at");
  CREATE INDEX "_main_menu_v_updated_at_idx" ON "payload"."_main_menu_v" USING btree ("updated_at");
  CREATE INDEX "_main_menu_v_snapshot_idx" ON "payload"."_main_menu_v" USING btree ("snapshot");
  CREATE INDEX "_main_menu_v_published_locale_idx" ON "payload"."_main_menu_v" USING btree ("published_locale");
  CREATE INDEX "_main_menu_v_latest_idx" ON "payload"."_main_menu_v" USING btree ("latest");
  CREATE INDEX "_main_menu_v_autosave_idx" ON "payload"."_main_menu_v" USING btree ("autosave");
  CREATE INDEX "footer_social_links_order_idx" ON "payload"."footer_social_links" USING btree ("_order");
  CREATE INDEX "footer_social_links_parent_id_idx" ON "payload"."footer_social_links" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_links_order_idx" ON "payload"."footer_columns_links" USING btree ("_order");
  CREATE INDEX "footer_columns_links_parent_id_idx" ON "payload"."footer_columns_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "footer_columns_links_locales_locale_parent_id_unique" ON "payload"."footer_columns_links_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "footer_columns_order_idx" ON "payload"."footer_columns" USING btree ("_order");
  CREATE INDEX "footer_columns_parent_id_idx" ON "payload"."footer_columns" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "footer_columns_locales_locale_parent_id_unique" ON "payload"."footer_columns_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "footer__status_idx" ON "payload"."footer" USING btree ("_status");
  CREATE UNIQUE INDEX "footer_locales_locale_parent_id_unique" ON "payload"."footer_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_footer_v_version_social_links_order_idx" ON "payload"."_footer_v_version_social_links" USING btree ("_order");
  CREATE INDEX "_footer_v_version_social_links_parent_id_idx" ON "payload"."_footer_v_version_social_links" USING btree ("_parent_id");
  CREATE INDEX "_footer_v_version_columns_links_order_idx" ON "payload"."_footer_v_version_columns_links" USING btree ("_order");
  CREATE INDEX "_footer_v_version_columns_links_parent_id_idx" ON "payload"."_footer_v_version_columns_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_footer_v_version_columns_links_locales_locale_parent_id_uni" ON "payload"."_footer_v_version_columns_links_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_footer_v_version_columns_order_idx" ON "payload"."_footer_v_version_columns" USING btree ("_order");
  CREATE INDEX "_footer_v_version_columns_parent_id_idx" ON "payload"."_footer_v_version_columns" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_footer_v_version_columns_locales_locale_parent_id_unique" ON "payload"."_footer_v_version_columns_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_footer_v_version_version__status_idx" ON "payload"."_footer_v" USING btree ("version__status");
  CREATE INDEX "_footer_v_created_at_idx" ON "payload"."_footer_v" USING btree ("created_at");
  CREATE INDEX "_footer_v_updated_at_idx" ON "payload"."_footer_v" USING btree ("updated_at");
  CREATE INDEX "_footer_v_snapshot_idx" ON "payload"."_footer_v" USING btree ("snapshot");
  CREATE INDEX "_footer_v_published_locale_idx" ON "payload"."_footer_v" USING btree ("published_locale");
  CREATE INDEX "_footer_v_latest_idx" ON "payload"."_footer_v" USING btree ("latest");
  CREATE INDEX "_footer_v_autosave_idx" ON "payload"."_footer_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "_footer_v_locales_locale_parent_id_unique" ON "payload"."_footer_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "branding_logo_light_idx" ON "payload"."branding" USING btree ("logo_light_id");
  CREATE INDEX "branding_logo_dark_idx" ON "payload"."branding" USING btree ("logo_dark_id");
  CREATE INDEX "branding_favicon_source_light_idx" ON "payload"."branding" USING btree ("favicon_source_light_id");
  CREATE INDEX "branding_favicon_source_dark_idx" ON "payload"."branding" USING btree ("favicon_source_dark_id");
  CREATE UNIQUE INDEX "branding_locales_locale_parent_id_unique" ON "payload"."branding_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "settings_geocoding_provider_selection_required_tags_order_idx" ON "payload"."settings_geocoding_provider_selection_required_tags" USING btree ("order");
  CREATE INDEX "settings_geocoding_provider_selection_required_tags_parent_idx" ON "payload"."settings_geocoding_provider_selection_required_tags" USING btree ("parent_id");
  CREATE UNIQUE INDEX "settings_locales_locale_parent_id_unique" ON "payload"."settings_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."catalogs" CASCADE;
  DROP TABLE "payload"."_catalogs_v" CASCADE;
  DROP TABLE "payload"."data_exports" CASCADE;
  DROP TABLE "payload"."datasets_id_strategy_computed_id_fields" CASCADE;
  DROP TABLE "payload"."datasets_ingest_transforms" CASCADE;
  DROP TABLE "payload"."datasets" CASCADE;
  DROP TABLE "payload"."_datasets_v_version_id_strategy_computed_id_fields" CASCADE;
  DROP TABLE "payload"."_datasets_v_version_ingest_transforms" CASCADE;
  DROP TABLE "payload"."_datasets_v" CASCADE;
  DROP TABLE "payload"."dataset_schemas_schema_summary_new_fields" CASCADE;
  DROP TABLE "payload"."dataset_schemas_schema_summary_removed_fields" CASCADE;
  DROP TABLE "payload"."dataset_schemas_schema_summary_type_changes" CASCADE;
  DROP TABLE "payload"."dataset_schemas_schema_summary_enum_changes" CASCADE;
  DROP TABLE "payload"."dataset_schemas_ingest_sources" CASCADE;
  DROP TABLE "payload"."dataset_schemas" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_schema_summary_new_fields" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_schema_summary_type_changes" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_ingest_sources" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v" CASCADE;
  DROP TABLE "payload"."audit_log" CASCADE;
  DROP TABLE "payload"."ingest_files" CASCADE;
  DROP TABLE "payload"."ingest_files_rels" CASCADE;
  DROP TABLE "payload"."_ingest_files_v" CASCADE;
  DROP TABLE "payload"."_ingest_files_v_rels" CASCADE;
  DROP TABLE "payload"."ingest_jobs_errors" CASCADE;
  DROP TABLE "payload"."ingest_jobs" CASCADE;
  DROP TABLE "payload"."_ingest_jobs_v_version_errors" CASCADE;
  DROP TABLE "payload"."_ingest_jobs_v" CASCADE;
  DROP TABLE "payload"."scheduled_ingests_multi_sheet_config_sheets" CASCADE;
  DROP TABLE "payload"."scheduled_ingests_execution_history" CASCADE;
  DROP TABLE "payload"."scheduled_ingests" CASCADE;
  DROP TABLE "payload"."_scheduled_ingests_v_version_multi_sheet_config_sheets" CASCADE;
  DROP TABLE "payload"."_scheduled_ingests_v_version_execution_history" CASCADE;
  DROP TABLE "payload"."_scheduled_ingests_v" CASCADE;
  DROP TABLE "payload"."scraper_repos" CASCADE;
  DROP TABLE "payload"."scrapers" CASCADE;
  DROP TABLE "payload"."scraper_runs" CASCADE;
  DROP TABLE "payload"."events" CASCADE;
  DROP TABLE "payload"."_events_v" CASCADE;
  DROP TABLE "payload"."users_sessions" CASCADE;
  DROP TABLE "payload"."users" CASCADE;
  DROP TABLE "payload"."user_usage" CASCADE;
  DROP TABLE "payload"."media" CASCADE;
  DROP TABLE "payload"."_media_v" CASCADE;
  DROP TABLE "payload"."location_cache" CASCADE;
  DROP TABLE "payload"."_location_cache_v" CASCADE;
  DROP TABLE "payload"."geocoding_providers_tags" CASCADE;
  DROP TABLE "payload"."geocoding_providers" CASCADE;
  DROP TABLE "payload"."_geocoding_providers_v_version_tags" CASCADE;
  DROP TABLE "payload"."_geocoding_providers_v" CASCADE;
  DROP TABLE "payload"."pages_blocks_hero_buttons" CASCADE;
  DROP TABLE "payload"."pages_blocks_hero_buttons_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_hero" CASCADE;
  DROP TABLE "payload"."pages_blocks_hero_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_features_features" CASCADE;
  DROP TABLE "payload"."pages_blocks_features_features_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_features" CASCADE;
  DROP TABLE "payload"."pages_blocks_features_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_stats_stats" CASCADE;
  DROP TABLE "payload"."pages_blocks_stats_stats_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_stats" CASCADE;
  DROP TABLE "payload"."pages_blocks_details_grid_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_details_grid_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_details_grid" CASCADE;
  DROP TABLE "payload"."pages_blocks_details_grid_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonials_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonials_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonials" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonials_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_rich_text" CASCADE;
  DROP TABLE "payload"."pages_blocks_rich_text_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_cta" CASCADE;
  DROP TABLE "payload"."pages_blocks_cta_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_newsletter_form" CASCADE;
  DROP TABLE "payload"."pages_blocks_newsletter_form_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_newsletter_c_t_a" CASCADE;
  DROP TABLE "payload"."pages_blocks_newsletter_c_t_a_locales" CASCADE;
  DROP TABLE "payload"."pages" CASCADE;
  DROP TABLE "payload"."pages_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero_buttons" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero_buttons_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_features_features" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_features_features_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_features" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_features_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stats_stats" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stats_stats_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stats" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_details_grid_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_details_grid_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_details_grid" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_details_grid_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonials_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonials_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonials" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonials_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_rich_text" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_rich_text_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_cta" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_cta_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_newsletter_form" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_newsletter_form_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_newsletter_c_t_a_locales" CASCADE;
  DROP TABLE "payload"."_pages_v" CASCADE;
  DROP TABLE "payload"."_pages_v_locales" CASCADE;
  DROP TABLE "payload"."sites" CASCADE;
  DROP TABLE "payload"."_sites_v" CASCADE;
  DROP TABLE "payload"."themes" CASCADE;
  DROP TABLE "payload"."_themes_v" CASCADE;
  DROP TABLE "payload"."layout_templates" CASCADE;
  DROP TABLE "payload"."_layout_templates_v" CASCADE;
  DROP TABLE "payload"."views_filter_config_fields" CASCADE;
  DROP TABLE "payload"."views" CASCADE;
  DROP TABLE "payload"."views_rels" CASCADE;
  DROP TABLE "payload"."_views_v_version_filter_config_fields" CASCADE;
  DROP TABLE "payload"."_views_v" CASCADE;
  DROP TABLE "payload"."_views_v_rels" CASCADE;
  DROP TABLE "payload"."schema_detectors" CASCADE;
  DROP TABLE "payload"."payload_kv" CASCADE;
  DROP TABLE "payload"."payload_jobs_log" CASCADE;
  DROP TABLE "payload"."payload_jobs" CASCADE;
  DROP TABLE "payload"."payload_locked_documents" CASCADE;
  DROP TABLE "payload"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload"."payload_preferences" CASCADE;
  DROP TABLE "payload"."payload_preferences_rels" CASCADE;
  DROP TABLE "payload"."payload_migrations" CASCADE;
  DROP TABLE "payload"."main_menu_nav_items" CASCADE;
  DROP TABLE "payload"."main_menu_nav_items_locales" CASCADE;
  DROP TABLE "payload"."main_menu" CASCADE;
  DROP TABLE "payload"."_main_menu_v_version_nav_items" CASCADE;
  DROP TABLE "payload"."_main_menu_v_version_nav_items_locales" CASCADE;
  DROP TABLE "payload"."_main_menu_v" CASCADE;
  DROP TABLE "payload"."footer_social_links" CASCADE;
  DROP TABLE "payload"."footer_columns_links" CASCADE;
  DROP TABLE "payload"."footer_columns_links_locales" CASCADE;
  DROP TABLE "payload"."footer_columns" CASCADE;
  DROP TABLE "payload"."footer_columns_locales" CASCADE;
  DROP TABLE "payload"."footer" CASCADE;
  DROP TABLE "payload"."footer_locales" CASCADE;
  DROP TABLE "payload"."_footer_v_version_social_links" CASCADE;
  DROP TABLE "payload"."_footer_v_version_columns_links" CASCADE;
  DROP TABLE "payload"."_footer_v_version_columns_links_locales" CASCADE;
  DROP TABLE "payload"."_footer_v_version_columns" CASCADE;
  DROP TABLE "payload"."_footer_v_version_columns_locales" CASCADE;
  DROP TABLE "payload"."_footer_v" CASCADE;
  DROP TABLE "payload"."_footer_v_locales" CASCADE;
  DROP TABLE "payload"."branding" CASCADE;
  DROP TABLE "payload"."branding_locales" CASCADE;
  DROP TABLE "payload"."settings_geocoding_provider_selection_required_tags" CASCADE;
  DROP TABLE "payload"."settings" CASCADE;
  DROP TABLE "payload"."settings_locales" CASCADE;
  DROP TABLE "payload"."payload_jobs_stats" CASCADE;
  DROP TYPE "payload"."_locales";
  DROP TYPE "payload"."enum_catalogs_status";
  DROP TYPE "payload"."enum__catalogs_v_version_status";
  DROP TYPE "payload"."enum__catalogs_v_published_locale";
  DROP TYPE "payload"."enum_data_exports_status";
  DROP TYPE "payload"."enum_datasets_ingest_transforms_type";
  DROP TYPE "payload"."enum_datasets_ingest_transforms_input_format";
  DROP TYPE "payload"."enum_datasets_ingest_transforms_output_format";
  DROP TYPE "payload"."enum_datasets_ingest_transforms_operation";
  DROP TYPE "payload"."enum_datasets_id_strategy_type";
  DROP TYPE "payload"."enum_datasets_id_strategy_duplicate_strategy";
  DROP TYPE "payload"."enum_datasets_schema_config_enum_mode";
  DROP TYPE "payload"."enum_datasets_deduplication_config_strategy";
  DROP TYPE "payload"."enum_datasets_enum_detection_mode";
  DROP TYPE "payload"."enum_datasets_status";
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_type";
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format";
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_output_format";
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_operation";
  DROP TYPE "payload"."enum__datasets_v_version_id_strategy_type";
  DROP TYPE "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy";
  DROP TYPE "payload"."enum__datasets_v_version_schema_config_enum_mode";
  DROP TYPE "payload"."enum__datasets_v_version_deduplication_config_strategy";
  DROP TYPE "payload"."enum__datasets_v_version_enum_detection_mode";
  DROP TYPE "payload"."enum__datasets_v_version_status";
  DROP TYPE "payload"."enum__datasets_v_published_locale";
  DROP TYPE "payload"."enum_dataset_schemas_status";
  DROP TYPE "payload"."enum__dataset_schemas_v_version_status";
  DROP TYPE "payload"."enum__dataset_schemas_v_published_locale";
  DROP TYPE "payload"."enum_ingest_files_status";
  DROP TYPE "payload"."enum__ingest_files_v_version_status";
  DROP TYPE "payload"."enum_ingest_jobs_stage";
  DROP TYPE "payload"."enum_ingest_jobs_last_successful_stage";
  DROP TYPE "payload"."enum__ingest_jobs_v_version_stage";
  DROP TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage";
  DROP TYPE "payload"."enum_scheduled_ingests_execution_history_status";
  DROP TYPE "payload"."trig_by";
  DROP TYPE "payload"."enum_scheduled_ingests_schedule_type";
  DROP TYPE "payload"."enum_scheduled_ingests_frequency";
  DROP TYPE "payload"."enum_scheduled_ingests_schema_mode";
  DROP TYPE "payload"."enum_scheduled_ingests_auth_config_type";
  DROP TYPE "payload"."si_response_format";
  DROP TYPE "payload"."si_json_paging_type";
  DROP TYPE "payload"."enum_scheduled_ingests_last_status";
  DROP TYPE "payload"."enum_scheduled_ingests_status";
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_execution_history_status";
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_schedule_type";
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_frequency";
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_schema_mode";
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_auth_config_type";
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_last_status";
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_status";
  DROP TYPE "payload"."enum__scheduled_ingests_v_published_locale";
  DROP TYPE "payload"."enum_scraper_repos_source_type";
  DROP TYPE "payload"."enum_scraper_repos_last_sync_status";
  DROP TYPE "payload"."enum_scrapers_runtime";
  DROP TYPE "payload"."enum_scrapers_last_run_status";
  DROP TYPE "payload"."enum_scraper_runs_status";
  DROP TYPE "payload"."enum_scraper_runs_triggered_by";
  DROP TYPE "payload"."enum_events_coordinate_source_type";
  DROP TYPE "payload"."enum_events_coordinate_source_validation_status";
  DROP TYPE "payload"."enum_events_geocoding_info_geocoding_status";
  DROP TYPE "payload"."enum_events_geocoding_info_provider";
  DROP TYPE "payload"."enum_events_validation_status";
  DROP TYPE "payload"."enum_events_status";
  DROP TYPE "payload"."enum__events_v_version_coordinate_source_type";
  DROP TYPE "payload"."enum__events_v_version_coordinate_source_validation_status";
  DROP TYPE "payload"."enum__events_v_version_geocoding_info_geocoding_status";
  DROP TYPE "payload"."enum__events_v_version_geocoding_info_provider";
  DROP TYPE "payload"."enum__events_v_version_validation_status";
  DROP TYPE "payload"."enum__events_v_version_status";
  DROP TYPE "payload"."enum__events_v_published_locale";
  DROP TYPE "payload"."enum_users_role";
  DROP TYPE "payload"."enum_users_registration_source";
  DROP TYPE "payload"."enum_users_locale";
  DROP TYPE "payload"."enum_users_trust_level";
  DROP TYPE "payload"."enum_users_deletion_status";
  DROP TYPE "payload"."enum_media_status";
  DROP TYPE "payload"."enum__media_v_version_status";
  DROP TYPE "payload"."enum__media_v_published_locale";
  DROP TYPE "payload"."enum_location_cache_status";
  DROP TYPE "payload"."enum__location_cache_v_version_status";
  DROP TYPE "payload"."enum__location_cache_v_published_locale";
  DROP TYPE "payload"."enum_geocoding_providers_tags";
  DROP TYPE "payload"."enum_geocoding_providers_type";
  DROP TYPE "payload"."enum_geocoding_providers_status";
  DROP TYPE "payload"."enum__geocoding_providers_v_version_tags";
  DROP TYPE "payload"."enum__geocoding_providers_v_version_type";
  DROP TYPE "payload"."enum__geocoding_providers_v_version_status";
  DROP TYPE "payload"."enum__geocoding_providers_v_published_locale";
  DROP TYPE "payload"."enum_pages_blocks_hero_buttons_variant";
  DROP TYPE "payload"."enum_pages_blocks_hero_background";
  DROP TYPE "payload"."pt";
  DROP TYPE "payload"."pb";
  DROP TYPE "payload"."mw";
  DROP TYPE "payload"."sep";
  DROP TYPE "payload"."enum_pages_blocks_features_features_icon";
  DROP TYPE "payload"."enum_pages_blocks_features_features_accent";
  DROP TYPE "payload"."enum_pages_blocks_features_columns";
  DROP TYPE "payload"."enum_pages_blocks_stats_stats_icon";
  DROP TYPE "payload"."enum_pages_blocks_details_grid_items_icon";
  DROP TYPE "payload"."enum_pages_blocks_details_grid_variant";
  DROP TYPE "payload"."enum_pages_blocks_timeline_variant";
  DROP TYPE "payload"."enum_pages_blocks_testimonials_items_avatar";
  DROP TYPE "payload"."enum_pages_blocks_testimonials_variant";
  DROP TYPE "payload"."enum_pages_blocks_newsletter_c_t_a_variant";
  DROP TYPE "payload"."enum_pages_blocks_newsletter_c_t_a_size";
  DROP TYPE "payload"."enum_pages_status";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_buttons_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_background";
  DROP TYPE "payload"."enum__pages_v_blocks_features_features_icon";
  DROP TYPE "payload"."enum__pages_v_blocks_features_features_accent";
  DROP TYPE "payload"."enum__pages_v_blocks_features_columns";
  DROP TYPE "payload"."enum__pages_v_blocks_stats_stats_icon";
  DROP TYPE "payload"."enum__pages_v_blocks_details_grid_items_icon";
  DROP TYPE "payload"."enum__pages_v_blocks_details_grid_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_timeline_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_testimonials_items_avatar";
  DROP TYPE "payload"."enum__pages_v_blocks_testimonials_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_newsletter_c_t_a_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_newsletter_c_t_a_size";
  DROP TYPE "payload"."enum__pages_v_version_status";
  DROP TYPE "payload"."enum__pages_v_published_locale";
  DROP TYPE "payload"."enum_sites_branding_typography_font_pairing";
  DROP TYPE "payload"."enum_sites_branding_style_border_radius";
  DROP TYPE "payload"."enum_sites_branding_style_density";
  DROP TYPE "payload"."enum_sites_status";
  DROP TYPE "payload"."enum__sites_v_version_branding_typography_font_pairing";
  DROP TYPE "payload"."enum__sites_v_version_branding_style_border_radius";
  DROP TYPE "payload"."enum__sites_v_version_branding_style_density";
  DROP TYPE "payload"."enum__sites_v_version_status";
  DROP TYPE "payload"."enum__sites_v_published_locale";
  DROP TYPE "payload"."enum_themes_typography_font_pairing";
  DROP TYPE "payload"."enum_themes_style_border_radius";
  DROP TYPE "payload"."enum_themes_style_density";
  DROP TYPE "payload"."enum_themes_status";
  DROP TYPE "payload"."enum__themes_v_version_typography_font_pairing";
  DROP TYPE "payload"."enum__themes_v_version_style_border_radius";
  DROP TYPE "payload"."enum__themes_v_version_style_density";
  DROP TYPE "payload"."enum__themes_v_version_status";
  DROP TYPE "payload"."enum__themes_v_published_locale";
  DROP TYPE "payload"."enum_layout_templates_header_variant";
  DROP TYPE "payload"."enum_layout_templates_footer_variant";
  DROP TYPE "payload"."enum_layout_templates_content_max_width";
  DROP TYPE "payload"."enum_layout_templates_status";
  DROP TYPE "payload"."enum__layout_templates_v_version_header_variant";
  DROP TYPE "payload"."enum__layout_templates_v_version_footer_variant";
  DROP TYPE "payload"."enum__layout_templates_v_version_content_max_width";
  DROP TYPE "payload"."enum__layout_templates_v_version_status";
  DROP TYPE "payload"."enum__layout_templates_v_published_locale";
  DROP TYPE "payload"."enum_views_data_scope_mode";
  DROP TYPE "payload"."enum_views_filter_config_mode";
  DROP TYPE "payload"."enum_views_map_settings_base_map_style";
  DROP TYPE "payload"."enum_views_status";
  DROP TYPE "payload"."enum__views_v_version_data_scope_mode";
  DROP TYPE "payload"."enum__views_v_version_filter_config_mode";
  DROP TYPE "payload"."enum__views_v_version_map_settings_base_map_style";
  DROP TYPE "payload"."enum__views_v_version_status";
  DROP TYPE "payload"."enum__views_v_published_locale";
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  DROP TYPE "payload"."enum_payload_jobs_log_state";
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  DROP TYPE "payload"."enum_main_menu_status";
  DROP TYPE "payload"."enum__main_menu_v_version_status";
  DROP TYPE "payload"."enum__main_menu_v_published_locale";
  DROP TYPE "payload"."enum_footer_social_links_platform";
  DROP TYPE "payload"."enum_footer_status";
  DROP TYPE "payload"."enum__footer_v_version_social_links_platform";
  DROP TYPE "payload"."enum__footer_v_version_status";
  DROP TYPE "payload"."enum__footer_v_published_locale";
  DROP TYPE "payload"."enum_settings_geocoding_provider_selection_required_tags";
  DROP TYPE "payload"."enum_settings_geocoding_provider_selection_strategy";`)
}
