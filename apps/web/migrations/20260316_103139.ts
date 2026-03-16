import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."_locales" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__catalogs_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__datasets_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__dataset_schemas_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__scheduled_imports_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__events_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__media_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__location_cache_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__geocoding_providers_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."pt" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."pb" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."mw" AS ENUM('sm', 'md', 'lg', 'xl', 'full');
  CREATE TYPE "payload"."sep" AS ENUM('none', 'line', 'gradient', 'wave');
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
  CREATE TYPE "payload"."enum__views_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__main_menu_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "payload"."enum__footer_v_published_locale" AS ENUM('en', 'de');
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'execute-account-deletion';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'execute-account-deletion';
  CREATE TABLE "payload"."pages_blocks_hero_buttons_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_hero_locales" (
  	"title" varchar,
  	"subtitle" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_features_features_locales" (
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_features_locales" (
  	"section_title" varchar,
  	"section_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_stats_stats_locales" (
  	"value" varchar,
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_details_grid_items_locales" (
  	"label" varchar,
  	"value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_details_grid_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline_items_locales" (
  	"date" varchar,
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonials_items_locales" (
  	"quote" varchar,
  	"author" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonials_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_rich_text_locales" (
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_cta_locales" (
  	"headline" varchar,
  	"description" varchar,
  	"button_text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_newsletter_form_locales" (
  	"headline" varchar DEFAULT 'Stay Mapped In',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
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
  
  CREATE TABLE "payload"."pages_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero_buttons_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero_locales" (
  	"title" varchar,
  	"subtitle" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_features_features_locales" (
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_features_locales" (
  	"section_title" varchar,
  	"section_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stats_stats_locales" (
  	"value" varchar,
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_details_grid_items_locales" (
  	"label" varchar,
  	"value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_details_grid_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline_items_locales" (
  	"date" varchar,
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonials_items_locales" (
  	"quote" varchar,
  	"author" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonials_locales" (
  	"section_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_rich_text_locales" (
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_cta_locales" (
  	"headline" varchar,
  	"description" varchar,
  	"button_text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_newsletter_form_locales" (
  	"headline" varchar DEFAULT 'Stay Mapped In',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
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
  
  CREATE TABLE "payload"."main_menu_nav_items_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."_main_menu_v_version_nav_items_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."footer_columns_links_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."footer_columns_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
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
  
  CREATE TABLE "payload"."_footer_v_version_columns_links_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_footer_v_version_columns_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
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
  
  CREATE TABLE "payload"."branding_locales" (
  	"site_name" varchar DEFAULT 'TimeTiles',
  	"site_description" varchar DEFAULT 'Making spatial and temporal data analysis accessible to everyone.',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."views" DROP CONSTRAINT "views_branding_logo_id_media_id_fk";
  
  ALTER TABLE "payload"."views" DROP CONSTRAINT "views_branding_favicon_id_media_id_fk";
  
  ALTER TABLE "payload"."_views_v" DROP CONSTRAINT "_views_v_version_branding_logo_id_media_id_fk";
  
  ALTER TABLE "payload"."_views_v" DROP CONSTRAINT "_views_v_version_branding_favicon_id_media_id_fk";
  
  DROP INDEX "payload"."views_branding_branding_domain_idx";
  DROP INDEX "payload"."views_branding_branding_logo_idx";
  DROP INDEX "payload"."views_branding_branding_favicon_idx";
  DROP INDEX "payload"."_views_v_version_branding_version_branding_domain_idx";
  DROP INDEX "payload"."_views_v_version_branding_version_branding_logo_idx";
  DROP INDEX "payload"."_views_v_version_branding_version_branding_favicon_idx";
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "published_locale" "payload"."enum__catalogs_v_published_locale";
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "published_locale" "payload"."enum__datasets_v_published_locale";
  ALTER TABLE "payload"."_dataset_schemas_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD COLUMN "published_locale" "payload"."enum__dataset_schemas_v_published_locale";
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "published_locale" "payload"."enum__scheduled_imports_v_published_locale";
  ALTER TABLE "payload"."_events_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_events_v" ADD COLUMN "published_locale" "payload"."enum__events_v_published_locale";
  ALTER TABLE "payload"."_media_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_media_v" ADD COLUMN "published_locale" "payload"."enum__media_v_published_locale";
  ALTER TABLE "payload"."_location_cache_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_location_cache_v" ADD COLUMN "published_locale" "payload"."enum__location_cache_v_published_locale";
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "published_locale" "payload"."enum__geocoding_providers_v_published_locale";
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_stats" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_stats" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_stats" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_stats" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_stats" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_stats" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_stats" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_stats" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_timeline" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_timeline" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_timeline" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_timeline" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_timeline" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_timeline" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_timeline" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_timeline" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."pages" ADD COLUMN "site_id" integer;
  ALTER TABLE "payload"."pages" ADD COLUMN "layout_override_id" integer;
  ALTER TABLE "payload"."pages" ADD COLUMN "created_by_id" integer;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "block_style_padding_top" "payload"."pt";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "block_style_padding_bottom" "payload"."pb";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "block_style_max_width" "payload"."mw";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "block_style_separator" "payload"."sep";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "block_style_background_color" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "block_style_anchor_id" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "block_style_hide_on_mobile" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "block_style_hide_on_desktop" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_site_id" integer;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_layout_override_id" integer;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_created_by_id" integer;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "published_locale" "payload"."enum__pages_v_published_locale";
  ALTER TABLE "payload"."views" ADD COLUMN "site_id" integer;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "version_site_id" integer;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "published_locale" "payload"."enum__views_v_published_locale";
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "sites_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "themes_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "layout_templates_id" integer;
  ALTER TABLE "payload"."_main_menu_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_main_menu_v" ADD COLUMN "published_locale" "payload"."enum__main_menu_v_published_locale";
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "published_locale" "payload"."enum__footer_v_published_locale";
  ALTER TABLE "payload"."pages_blocks_hero_buttons_locales" ADD CONSTRAINT "pages_blocks_hero_buttons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hero_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero_locales" ADD CONSTRAINT "pages_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_features_features_locales" ADD CONSTRAINT "pages_blocks_features_features_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_features_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_features_locales" ADD CONSTRAINT "pages_blocks_features_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stats_stats_locales" ADD CONSTRAINT "pages_blocks_stats_stats_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stats_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_details_grid_items_locales" ADD CONSTRAINT "pages_blocks_details_grid_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_details_grid_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_details_grid_locales" ADD CONSTRAINT "pages_blocks_details_grid_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_details_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline_items_locales" ADD CONSTRAINT "pages_blocks_timeline_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_timeline_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline_locales" ADD CONSTRAINT "pages_blocks_timeline_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonials_items_locales" ADD CONSTRAINT "pages_blocks_testimonials_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_testimonials_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonials_locales" ADD CONSTRAINT "pages_blocks_testimonials_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_rich_text_locales" ADD CONSTRAINT "pages_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_cta_locales" ADD CONSTRAINT "pages_blocks_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_newsletter_form_locales" ADD CONSTRAINT "pages_blocks_newsletter_form_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_newsletter_form"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a_locales" ADD CONSTRAINT "pages_blocks_newsletter_c_t_a_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_newsletter_c_t_a"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero_buttons_locales" ADD CONSTRAINT "_pages_v_blocks_hero_buttons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hero_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero_locales" ADD CONSTRAINT "_pages_v_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_features_features_locales" ADD CONSTRAINT "_pages_v_blocks_features_features_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_features_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_features_locales" ADD CONSTRAINT "_pages_v_blocks_features_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats_locales" ADD CONSTRAINT "_pages_v_blocks_stats_stats_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stats_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_items_locales" ADD CONSTRAINT "_pages_v_blocks_details_grid_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_details_grid_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_locales" ADD CONSTRAINT "_pages_v_blocks_details_grid_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_details_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items_locales" ADD CONSTRAINT "_pages_v_blocks_timeline_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_timeline_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_locales" ADD CONSTRAINT "_pages_v_blocks_timeline_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items_locales" ADD CONSTRAINT "_pages_v_blocks_testimonials_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_testimonials_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_locales" ADD CONSTRAINT "_pages_v_blocks_testimonials_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text_locales" ADD CONSTRAINT "_pages_v_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_cta_locales" ADD CONSTRAINT "_pages_v_blocks_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form_locales" ADD CONSTRAINT "_pages_v_blocks_newsletter_form_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_newsletter_form"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a_locales" ADD CONSTRAINT "_pages_v_blocks_newsletter_c_t_a_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_newsletter_c_t_a"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "payload"."main_menu_nav_items_locales" ADD CONSTRAINT "main_menu_nav_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."main_menu_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_main_menu_v_version_nav_items_locales" ADD CONSTRAINT "_main_menu_v_version_nav_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_main_menu_v_version_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_columns_links_locales" ADD CONSTRAINT "footer_columns_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer_columns_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_columns_locales" ADD CONSTRAINT "footer_columns_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."footer_locales" ADD CONSTRAINT "footer_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_version_columns_links_locales" ADD CONSTRAINT "_footer_v_version_columns_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v_version_columns_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_version_columns_locales" ADD CONSTRAINT "_footer_v_version_columns_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v_version_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_locales" ADD CONSTRAINT "_footer_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."branding_locales" ADD CONSTRAINT "branding_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."branding"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "pages_blocks_hero_buttons_locales_locale_parent_id_unique" ON "payload"."pages_blocks_hero_buttons_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_hero_locales_locale_parent_id_unique" ON "payload"."pages_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_features_features_locales_locale_parent_id_uniq" ON "payload"."pages_blocks_features_features_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_features_locales_locale_parent_id_unique" ON "payload"."pages_blocks_features_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_stats_stats_locales_locale_parent_id_unique" ON "payload"."pages_blocks_stats_stats_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_details_grid_items_locales_locale_parent_id_uni" ON "payload"."pages_blocks_details_grid_items_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_details_grid_locales_locale_parent_id_unique" ON "payload"."pages_blocks_details_grid_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_timeline_items_locales_locale_parent_id_unique" ON "payload"."pages_blocks_timeline_items_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_timeline_locales_locale_parent_id_unique" ON "payload"."pages_blocks_timeline_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_testimonials_items_locales_locale_parent_id_uni" ON "payload"."pages_blocks_testimonials_items_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_testimonials_locales_locale_parent_id_unique" ON "payload"."pages_blocks_testimonials_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_rich_text_locales_locale_parent_id_unique" ON "payload"."pages_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_cta_locales_locale_parent_id_unique" ON "payload"."pages_blocks_cta_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_newsletter_form_locales_locale_parent_id_unique" ON "payload"."pages_blocks_newsletter_form_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_newsletter_c_t_a_locales_locale_parent_id_uniqu" ON "payload"."pages_blocks_newsletter_c_t_a_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "payload"."pages_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_hero_buttons_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_hero_buttons_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_hero_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_features_features_locales_locale_parent_id_u" ON "payload"."_pages_v_blocks_features_features_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_features_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_features_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_stats_stats_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_stats_stats_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_details_grid_items_locales_locale_parent_id_" ON "payload"."_pages_v_blocks_details_grid_items_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_details_grid_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_details_grid_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_timeline_items_locales_locale_parent_id_uniq" ON "payload"."_pages_v_blocks_timeline_items_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_timeline_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_timeline_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_testimonials_items_locales_locale_parent_id_" ON "payload"."_pages_v_blocks_testimonials_items_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_testimonials_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_testimonials_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_rich_text_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_cta_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_cta_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_newsletter_form_locales_locale_parent_id_uni" ON "payload"."_pages_v_blocks_newsletter_form_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_newsletter_c_t_a_locales_locale_parent_id_un" ON "payload"."_pages_v_blocks_newsletter_c_t_a_locales" USING btree ("_locale","_parent_id");
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
  CREATE UNIQUE INDEX "main_menu_nav_items_locales_locale_parent_id_unique" ON "payload"."main_menu_nav_items_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_main_menu_v_version_nav_items_locales_locale_parent_id_uniq" ON "payload"."_main_menu_v_version_nav_items_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "footer_columns_links_locales_locale_parent_id_unique" ON "payload"."footer_columns_links_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "footer_columns_locales_locale_parent_id_unique" ON "payload"."footer_columns_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "footer_locales_locale_parent_id_unique" ON "payload"."footer_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_footer_v_version_columns_links_locales_locale_parent_id_uni" ON "payload"."_footer_v_version_columns_links_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_footer_v_version_columns_locales_locale_parent_id_unique" ON "payload"."_footer_v_version_columns_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_footer_v_locales_locale_parent_id_unique" ON "payload"."_footer_v_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "branding_locales_locale_parent_id_unique" ON "payload"."branding_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_layout_override_id_layout_templates_id_fk" FOREIGN KEY ("layout_override_id") REFERENCES "payload"."layout_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_version_layout_override_id_layout_templates_id_fk" FOREIGN KEY ("version_layout_override_id") REFERENCES "payload"."layout_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."views" ADD CONSTRAINT "views_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sites_fk" FOREIGN KEY ("sites_id") REFERENCES "payload"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_themes_fk" FOREIGN KEY ("themes_id") REFERENCES "payload"."themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_layout_templates_fk" FOREIGN KEY ("layout_templates_id") REFERENCES "payload"."layout_templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "_catalogs_v_snapshot_idx" ON "payload"."_catalogs_v" USING btree ("snapshot");
  CREATE INDEX "_catalogs_v_published_locale_idx" ON "payload"."_catalogs_v" USING btree ("published_locale");
  CREATE INDEX "_datasets_v_snapshot_idx" ON "payload"."_datasets_v" USING btree ("snapshot");
  CREATE INDEX "_datasets_v_published_locale_idx" ON "payload"."_datasets_v" USING btree ("published_locale");
  CREATE INDEX "_dataset_schemas_v_snapshot_idx" ON "payload"."_dataset_schemas_v" USING btree ("snapshot");
  CREATE INDEX "_dataset_schemas_v_published_locale_idx" ON "payload"."_dataset_schemas_v" USING btree ("published_locale");
  CREATE INDEX "_scheduled_imports_v_snapshot_idx" ON "payload"."_scheduled_imports_v" USING btree ("snapshot");
  CREATE INDEX "_scheduled_imports_v_published_locale_idx" ON "payload"."_scheduled_imports_v" USING btree ("published_locale");
  CREATE INDEX "_events_v_snapshot_idx" ON "payload"."_events_v" USING btree ("snapshot");
  CREATE INDEX "_events_v_published_locale_idx" ON "payload"."_events_v" USING btree ("published_locale");
  CREATE INDEX "_media_v_snapshot_idx" ON "payload"."_media_v" USING btree ("snapshot");
  CREATE INDEX "_media_v_published_locale_idx" ON "payload"."_media_v" USING btree ("published_locale");
  CREATE INDEX "_location_cache_v_snapshot_idx" ON "payload"."_location_cache_v" USING btree ("snapshot");
  CREATE INDEX "_location_cache_v_published_locale_idx" ON "payload"."_location_cache_v" USING btree ("published_locale");
  CREATE INDEX "_geocoding_providers_v_snapshot_idx" ON "payload"."_geocoding_providers_v" USING btree ("snapshot");
  CREATE INDEX "_geocoding_providers_v_published_locale_idx" ON "payload"."_geocoding_providers_v" USING btree ("published_locale");
  CREATE INDEX "pages_site_idx" ON "payload"."pages" USING btree ("site_id");
  CREATE INDEX "pages_layout_override_idx" ON "payload"."pages" USING btree ("layout_override_id");
  CREATE INDEX "pages_created_by_idx" ON "payload"."pages" USING btree ("created_by_id");
  CREATE INDEX "_pages_v_version_version_site_idx" ON "payload"."_pages_v" USING btree ("version_site_id");
  CREATE INDEX "_pages_v_version_version_layout_override_idx" ON "payload"."_pages_v" USING btree ("version_layout_override_id");
  CREATE INDEX "_pages_v_version_version_created_by_idx" ON "payload"."_pages_v" USING btree ("version_created_by_id");
  CREATE INDEX "_pages_v_snapshot_idx" ON "payload"."_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "payload"."_pages_v" USING btree ("published_locale");
  CREATE INDEX "views_site_idx" ON "payload"."views" USING btree ("site_id");
  CREATE INDEX "_views_v_version_version_site_idx" ON "payload"."_views_v" USING btree ("version_site_id");
  CREATE INDEX "_views_v_snapshot_idx" ON "payload"."_views_v" USING btree ("snapshot");
  CREATE INDEX "_views_v_published_locale_idx" ON "payload"."_views_v" USING btree ("published_locale");
  CREATE INDEX "payload_locked_documents_rels_sites_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("sites_id");
  CREATE INDEX "payload_locked_documents_rels_themes_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("themes_id");
  CREATE INDEX "payload_locked_documents_rels_layout_templates_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("layout_templates_id");
  CREATE INDEX "_main_menu_v_snapshot_idx" ON "payload"."_main_menu_v" USING btree ("snapshot");
  CREATE INDEX "_main_menu_v_published_locale_idx" ON "payload"."_main_menu_v" USING btree ("published_locale");
  CREATE INDEX "_footer_v_snapshot_idx" ON "payload"."_footer_v" USING btree ("snapshot");
  CREATE INDEX "_footer_v_published_locale_idx" ON "payload"."_footer_v" USING btree ("published_locale");
  ALTER TABLE "payload"."pages_blocks_hero_buttons" DROP COLUMN "text";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "title";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "subtitle";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "description";
  ALTER TABLE "payload"."pages_blocks_features_features" DROP COLUMN "title";
  ALTER TABLE "payload"."pages_blocks_features_features" DROP COLUMN "description";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "section_title";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "section_description";
  ALTER TABLE "payload"."pages_blocks_stats_stats" DROP COLUMN "value";
  ALTER TABLE "payload"."pages_blocks_stats_stats" DROP COLUMN "label";
  ALTER TABLE "payload"."pages_blocks_details_grid_items" DROP COLUMN "label";
  ALTER TABLE "payload"."pages_blocks_details_grid_items" DROP COLUMN "value";
  ALTER TABLE "payload"."pages_blocks_details_grid" DROP COLUMN "section_title";
  ALTER TABLE "payload"."pages_blocks_timeline_items" DROP COLUMN "date";
  ALTER TABLE "payload"."pages_blocks_timeline_items" DROP COLUMN "title";
  ALTER TABLE "payload"."pages_blocks_timeline_items" DROP COLUMN "description";
  ALTER TABLE "payload"."pages_blocks_timeline" DROP COLUMN "section_title";
  ALTER TABLE "payload"."pages_blocks_testimonials_items" DROP COLUMN "quote";
  ALTER TABLE "payload"."pages_blocks_testimonials_items" DROP COLUMN "author";
  ALTER TABLE "payload"."pages_blocks_testimonials_items" DROP COLUMN "role";
  ALTER TABLE "payload"."pages_blocks_testimonials" DROP COLUMN "section_title";
  ALTER TABLE "payload"."pages_blocks_rich_text" DROP COLUMN "content";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "headline";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "description";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "button_text";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "headline";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "placeholder";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "button_text";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "headline";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "description";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "placeholder";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "button_text";
  ALTER TABLE "payload"."pages" DROP COLUMN "title";
  ALTER TABLE "payload"."_pages_v_blocks_hero_buttons" DROP COLUMN "text";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "title";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "subtitle";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "description";
  ALTER TABLE "payload"."_pages_v_blocks_features_features" DROP COLUMN "title";
  ALTER TABLE "payload"."_pages_v_blocks_features_features" DROP COLUMN "description";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "section_title";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "section_description";
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats" DROP COLUMN "value";
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats" DROP COLUMN "label";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_items" DROP COLUMN "label";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_items" DROP COLUMN "value";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" DROP COLUMN "section_title";
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items" DROP COLUMN "date";
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items" DROP COLUMN "title";
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items" DROP COLUMN "description";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" DROP COLUMN "section_title";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items" DROP COLUMN "quote";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items" DROP COLUMN "author";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items" DROP COLUMN "role";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" DROP COLUMN "section_title";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DROP COLUMN "content";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "headline";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "description";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "button_text";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "headline";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "placeholder";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "button_text";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "headline";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "description";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "placeholder";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "button_text";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "version_title";
  ALTER TABLE "payload"."views" DROP COLUMN "branding_domain";
  ALTER TABLE "payload"."views" DROP COLUMN "branding_title";
  ALTER TABLE "payload"."views" DROP COLUMN "branding_logo_id";
  ALTER TABLE "payload"."views" DROP COLUMN "branding_favicon_id";
  ALTER TABLE "payload"."views" DROP COLUMN "branding_colors_primary";
  ALTER TABLE "payload"."views" DROP COLUMN "branding_colors_secondary";
  ALTER TABLE "payload"."views" DROP COLUMN "branding_colors_background";
  ALTER TABLE "payload"."views" DROP COLUMN "branding_header_html";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "version_branding_domain";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "version_branding_title";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "version_branding_logo_id";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "version_branding_favicon_id";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "version_branding_colors_primary";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "version_branding_colors_secondary";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "version_branding_colors_background";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "version_branding_header_html";
  ALTER TABLE "payload"."main_menu_nav_items" DROP COLUMN "label";
  ALTER TABLE "payload"."_main_menu_v_version_nav_items" DROP COLUMN "label";
  ALTER TABLE "payload"."footer_columns_links" DROP COLUMN "label";
  ALTER TABLE "payload"."footer_columns" DROP COLUMN "title";
  ALTER TABLE "payload"."footer" DROP COLUMN "tagline";
  ALTER TABLE "payload"."footer" DROP COLUMN "newsletter_headline";
  ALTER TABLE "payload"."footer" DROP COLUMN "newsletter_placeholder";
  ALTER TABLE "payload"."footer" DROP COLUMN "newsletter_button_text";
  ALTER TABLE "payload"."footer" DROP COLUMN "copyright";
  ALTER TABLE "payload"."footer" DROP COLUMN "credits";
  ALTER TABLE "payload"."_footer_v_version_columns_links" DROP COLUMN "label";
  ALTER TABLE "payload"."_footer_v_version_columns" DROP COLUMN "title";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_tagline";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_newsletter_headline";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_newsletter_placeholder";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_newsletter_button_text";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_copyright";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_credits";
  ALTER TABLE "payload"."branding" DROP COLUMN "site_name";
  ALTER TABLE "payload"."branding" DROP COLUMN "site_description";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_hero_buttons_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_hero_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_features_features_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_features_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_stats_stats_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_details_grid_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_details_grid_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_timeline_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_timeline_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_testimonials_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_testimonials_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_rich_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_cta_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_newsletter_form_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_hero_buttons_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_hero_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_features_features_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_features_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_cta_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."sites" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_sites_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."themes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_themes_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."layout_templates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_layout_templates_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."main_menu_nav_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_main_menu_v_version_nav_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."footer_columns_links_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."footer_columns_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."footer_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_footer_v_version_columns_links_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_footer_v_version_columns_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_footer_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."branding_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."pages_blocks_hero_buttons_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_hero_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_features_features_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_features_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_stats_stats_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_details_grid_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_details_grid_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonials_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonials_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_rich_text_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_cta_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_newsletter_form_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_newsletter_c_t_a_locales" CASCADE;
  DROP TABLE "payload"."pages_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero_buttons_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_features_features_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_features_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stats_stats_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_details_grid_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_details_grid_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonials_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonials_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_rich_text_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_cta_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_newsletter_form_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_newsletter_c_t_a_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_locales" CASCADE;
  DROP TABLE "payload"."sites" CASCADE;
  DROP TABLE "payload"."_sites_v" CASCADE;
  DROP TABLE "payload"."themes" CASCADE;
  DROP TABLE "payload"."_themes_v" CASCADE;
  DROP TABLE "payload"."layout_templates" CASCADE;
  DROP TABLE "payload"."_layout_templates_v" CASCADE;
  DROP TABLE "payload"."main_menu_nav_items_locales" CASCADE;
  DROP TABLE "payload"."_main_menu_v_version_nav_items_locales" CASCADE;
  DROP TABLE "payload"."footer_columns_links_locales" CASCADE;
  DROP TABLE "payload"."footer_columns_locales" CASCADE;
  DROP TABLE "payload"."footer_locales" CASCADE;
  DROP TABLE "payload"."_footer_v_version_columns_links_locales" CASCADE;
  DROP TABLE "payload"."_footer_v_version_columns_locales" CASCADE;
  DROP TABLE "payload"."_footer_v_locales" CASCADE;
  DROP TABLE "payload"."branding_locales" CASCADE;
  ALTER TABLE "payload"."pages" DROP CONSTRAINT "pages_site_id_sites_id_fk";
  
  ALTER TABLE "payload"."pages" DROP CONSTRAINT "pages_layout_override_id_layout_templates_id_fk";
  
  ALTER TABLE "payload"."pages" DROP CONSTRAINT "pages_created_by_id_users_id_fk";
  
  ALTER TABLE "payload"."_pages_v" DROP CONSTRAINT "_pages_v_version_site_id_sites_id_fk";
  
  ALTER TABLE "payload"."_pages_v" DROP CONSTRAINT "_pages_v_version_layout_override_id_layout_templates_id_fk";
  
  ALTER TABLE "payload"."_pages_v" DROP CONSTRAINT "_pages_v_version_created_by_id_users_id_fk";
  
  ALTER TABLE "payload"."views" DROP CONSTRAINT "views_site_id_sites_id_fk";
  
  ALTER TABLE "payload"."_views_v" DROP CONSTRAINT "_views_v_version_site_id_sites_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sites_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_themes_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_layout_templates_fk";
  
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  DROP INDEX "payload"."_catalogs_v_snapshot_idx";
  DROP INDEX "payload"."_catalogs_v_published_locale_idx";
  DROP INDEX "payload"."_datasets_v_snapshot_idx";
  DROP INDEX "payload"."_datasets_v_published_locale_idx";
  DROP INDEX "payload"."_dataset_schemas_v_snapshot_idx";
  DROP INDEX "payload"."_dataset_schemas_v_published_locale_idx";
  DROP INDEX "payload"."_scheduled_imports_v_snapshot_idx";
  DROP INDEX "payload"."_scheduled_imports_v_published_locale_idx";
  DROP INDEX "payload"."_events_v_snapshot_idx";
  DROP INDEX "payload"."_events_v_published_locale_idx";
  DROP INDEX "payload"."_media_v_snapshot_idx";
  DROP INDEX "payload"."_media_v_published_locale_idx";
  DROP INDEX "payload"."_location_cache_v_snapshot_idx";
  DROP INDEX "payload"."_location_cache_v_published_locale_idx";
  DROP INDEX "payload"."_geocoding_providers_v_snapshot_idx";
  DROP INDEX "payload"."_geocoding_providers_v_published_locale_idx";
  DROP INDEX "payload"."pages_site_idx";
  DROP INDEX "payload"."pages_layout_override_idx";
  DROP INDEX "payload"."pages_created_by_idx";
  DROP INDEX "payload"."_pages_v_version_version_site_idx";
  DROP INDEX "payload"."_pages_v_version_version_layout_override_idx";
  DROP INDEX "payload"."_pages_v_version_version_created_by_idx";
  DROP INDEX "payload"."_pages_v_snapshot_idx";
  DROP INDEX "payload"."_pages_v_published_locale_idx";
  DROP INDEX "payload"."views_site_idx";
  DROP INDEX "payload"."_views_v_version_version_site_idx";
  DROP INDEX "payload"."_views_v_snapshot_idx";
  DROP INDEX "payload"."_views_v_published_locale_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_sites_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_themes_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_layout_templates_id_idx";
  DROP INDEX "payload"."_main_menu_v_snapshot_idx";
  DROP INDEX "payload"."_main_menu_v_published_locale_idx";
  DROP INDEX "payload"."_footer_v_snapshot_idx";
  DROP INDEX "payload"."_footer_v_published_locale_idx";
  ALTER TABLE "payload"."pages_blocks_hero_buttons" ADD COLUMN "text" varchar;
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "title" varchar;
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "subtitle" varchar;
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "description" varchar;
  ALTER TABLE "payload"."pages_blocks_features_features" ADD COLUMN "title" varchar;
  ALTER TABLE "payload"."pages_blocks_features_features" ADD COLUMN "description" varchar;
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "section_title" varchar;
  ALTER TABLE "payload"."pages_blocks_features" ADD COLUMN "section_description" varchar;
  ALTER TABLE "payload"."pages_blocks_stats_stats" ADD COLUMN "value" varchar;
  ALTER TABLE "payload"."pages_blocks_stats_stats" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."pages_blocks_details_grid_items" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."pages_blocks_details_grid_items" ADD COLUMN "value" varchar;
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD COLUMN "section_title" varchar;
  ALTER TABLE "payload"."pages_blocks_timeline_items" ADD COLUMN "date" varchar;
  ALTER TABLE "payload"."pages_blocks_timeline_items" ADD COLUMN "title" varchar;
  ALTER TABLE "payload"."pages_blocks_timeline_items" ADD COLUMN "description" varchar;
  ALTER TABLE "payload"."pages_blocks_timeline" ADD COLUMN "section_title" varchar;
  ALTER TABLE "payload"."pages_blocks_testimonials_items" ADD COLUMN "quote" varchar;
  ALTER TABLE "payload"."pages_blocks_testimonials_items" ADD COLUMN "author" varchar;
  ALTER TABLE "payload"."pages_blocks_testimonials_items" ADD COLUMN "role" varchar;
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD COLUMN "section_title" varchar;
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD COLUMN "content" jsonb;
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "headline" varchar;
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "description" varchar;
  ALTER TABLE "payload"."pages_blocks_cta" ADD COLUMN "button_text" varchar;
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "headline" varchar DEFAULT 'Stay Mapped In';
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "placeholder" varchar DEFAULT 'your@email.address';
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD COLUMN "button_text" varchar DEFAULT 'Subscribe';
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "headline" varchar DEFAULT 'Never Miss a Discovery';
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "description" varchar DEFAULT 'Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.';
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "placeholder" varchar DEFAULT 'your@email.address';
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD COLUMN "button_text" varchar DEFAULT 'Subscribe to Updates';
  ALTER TABLE "payload"."pages" ADD COLUMN "title" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_hero_buttons" ADD COLUMN "text" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "title" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "subtitle" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "description" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_features_features" ADD COLUMN "title" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_features_features" ADD COLUMN "description" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "section_title" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD COLUMN "section_description" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats" ADD COLUMN "value" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_items" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_items" ADD COLUMN "value" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD COLUMN "section_title" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items" ADD COLUMN "date" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items" ADD COLUMN "title" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items" ADD COLUMN "description" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD COLUMN "section_title" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items" ADD COLUMN "quote" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items" ADD COLUMN "author" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items" ADD COLUMN "role" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD COLUMN "section_title" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD COLUMN "content" jsonb;
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "headline" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "description" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD COLUMN "button_text" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "headline" varchar DEFAULT 'Stay Mapped In';
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "placeholder" varchar DEFAULT 'your@email.address';
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD COLUMN "button_text" varchar DEFAULT 'Subscribe';
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "headline" varchar DEFAULT 'Never Miss a Discovery';
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "description" varchar DEFAULT 'Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.';
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "placeholder" varchar DEFAULT 'your@email.address';
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD COLUMN "button_text" varchar DEFAULT 'Subscribe to Updates';
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_title" varchar;
  ALTER TABLE "payload"."views" ADD COLUMN "branding_domain" varchar;
  ALTER TABLE "payload"."views" ADD COLUMN "branding_title" varchar;
  ALTER TABLE "payload"."views" ADD COLUMN "branding_logo_id" integer;
  ALTER TABLE "payload"."views" ADD COLUMN "branding_favicon_id" integer;
  ALTER TABLE "payload"."views" ADD COLUMN "branding_colors_primary" varchar;
  ALTER TABLE "payload"."views" ADD COLUMN "branding_colors_secondary" varchar;
  ALTER TABLE "payload"."views" ADD COLUMN "branding_colors_background" varchar;
  ALTER TABLE "payload"."views" ADD COLUMN "branding_header_html" varchar;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_domain" varchar;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_title" varchar;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_logo_id" integer;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_favicon_id" integer;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_colors_primary" varchar;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_colors_secondary" varchar;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_colors_background" varchar;
  ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_header_html" varchar;
  ALTER TABLE "payload"."main_menu_nav_items" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."_main_menu_v_version_nav_items" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."footer_columns_links" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."footer_columns" ADD COLUMN "title" varchar;
  ALTER TABLE "payload"."footer" ADD COLUMN "tagline" varchar;
  ALTER TABLE "payload"."footer" ADD COLUMN "newsletter_headline" varchar DEFAULT 'Stay Mapped In';
  ALTER TABLE "payload"."footer" ADD COLUMN "newsletter_placeholder" varchar DEFAULT 'your@email.address';
  ALTER TABLE "payload"."footer" ADD COLUMN "newsletter_button_text" varchar DEFAULT 'Subscribe';
  ALTER TABLE "payload"."footer" ADD COLUMN "copyright" varchar;
  ALTER TABLE "payload"."footer" ADD COLUMN "credits" varchar;
  ALTER TABLE "payload"."_footer_v_version_columns_links" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."_footer_v_version_columns" ADD COLUMN "title" varchar;
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_tagline" varchar;
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_newsletter_headline" varchar DEFAULT 'Stay Mapped In';
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_newsletter_placeholder" varchar DEFAULT 'your@email.address';
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_newsletter_button_text" varchar DEFAULT 'Subscribe';
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_copyright" varchar;
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_credits" varchar;
  ALTER TABLE "payload"."branding" ADD COLUMN "site_name" varchar DEFAULT 'TimeTiles';
  ALTER TABLE "payload"."branding" ADD COLUMN "site_description" varchar DEFAULT 'Making spatial and temporal data analysis accessible to everyone.';
  ALTER TABLE "payload"."views" ADD CONSTRAINT "views_branding_logo_id_media_id_fk" FOREIGN KEY ("branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."views" ADD CONSTRAINT "views_branding_favicon_id_media_id_fk" FOREIGN KEY ("branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_branding_logo_id_media_id_fk" FOREIGN KEY ("version_branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_branding_favicon_id_media_id_fk" FOREIGN KEY ("version_branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "views_branding_branding_domain_idx" ON "payload"."views" USING btree ("branding_domain");
  CREATE INDEX "views_branding_branding_logo_idx" ON "payload"."views" USING btree ("branding_logo_id");
  CREATE INDEX "views_branding_branding_favicon_idx" ON "payload"."views" USING btree ("branding_favicon_id");
  CREATE INDEX "_views_v_version_branding_version_branding_domain_idx" ON "payload"."_views_v" USING btree ("version_branding_domain");
  CREATE INDEX "_views_v_version_branding_version_branding_logo_idx" ON "payload"."_views_v" USING btree ("version_branding_logo_id");
  CREATE INDEX "_views_v_version_branding_version_branding_favicon_idx" ON "payload"."_views_v" USING btree ("version_branding_favicon_id");
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."_dataset_schemas_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_dataset_schemas_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."_events_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_events_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."_media_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_media_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."_location_cache_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_location_cache_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_features" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages_blocks_stats" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_stats" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_stats" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_stats" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_stats" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_stats" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_stats" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_stats" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages_blocks_details_grid" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_details_grid" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_details_grid" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_details_grid" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_details_grid" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_details_grid" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_details_grid" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_details_grid" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages_blocks_timeline" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_timeline" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_timeline" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_timeline" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_timeline" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_timeline" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_timeline" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_timeline" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages_blocks_testimonials" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_testimonials" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_testimonials" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_testimonials" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_testimonials" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_testimonials" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_testimonials" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_testimonials" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages_blocks_rich_text" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_rich_text" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_rich_text" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_rich_text" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_rich_text" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_rich_text" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_rich_text" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_rich_text" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_cta" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_newsletter_form" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."pages" DROP COLUMN "site_id";
  ALTER TABLE "payload"."pages" DROP COLUMN "layout_override_id";
  ALTER TABLE "payload"."pages" DROP COLUMN "created_by_id";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_features" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v_blocks_stats" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_stats" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_stats" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_stats" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_stats" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_stats" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_stats" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_stats" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_timeline" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_cta" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "block_style_padding_top";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "block_style_padding_bottom";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "block_style_max_width";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "block_style_separator";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "block_style_background_color";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "block_style_anchor_id";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "block_style_hide_on_mobile";
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" DROP COLUMN "block_style_hide_on_desktop";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "version_site_id";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "version_layout_override_id";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "version_created_by_id";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."views" DROP COLUMN "site_id";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "version_site_id";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_views_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "sites_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "themes_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "layout_templates_id";
  ALTER TABLE "payload"."_main_menu_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_main_menu_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "snapshot";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "published_locale";
  DROP TYPE "payload"."_locales";
  DROP TYPE "payload"."enum__catalogs_v_published_locale";
  DROP TYPE "payload"."enum__datasets_v_published_locale";
  DROP TYPE "payload"."enum__dataset_schemas_v_published_locale";
  DROP TYPE "payload"."enum__scheduled_imports_v_published_locale";
  DROP TYPE "payload"."enum__events_v_published_locale";
  DROP TYPE "payload"."enum__media_v_published_locale";
  DROP TYPE "payload"."enum__location_cache_v_published_locale";
  DROP TYPE "payload"."enum__geocoding_providers_v_published_locale";
  DROP TYPE "payload"."pt";
  DROP TYPE "payload"."pb";
  DROP TYPE "payload"."mw";
  DROP TYPE "payload"."sep";
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
  DROP TYPE "payload"."enum__views_v_published_locale";
  DROP TYPE "payload"."enum__main_menu_v_published_locale";
  DROP TYPE "payload"."enum__footer_v_published_locale";`)
}
