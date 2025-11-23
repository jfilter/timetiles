import type { MigrateUpArgs, MigrateDownArgs} from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_hero_buttons_variant" AS ENUM('default', 'outline');
  CREATE TYPE "payload"."enum_pages_blocks_hero_background" AS ENUM('gradient', 'grid');
  CREATE TYPE "payload"."enum_pages_blocks_features_features_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  CREATE TYPE "payload"."enum_pages_blocks_features_features_accent" AS ENUM('none', 'primary', 'secondary', 'accent', 'muted');
  CREATE TYPE "payload"."enum_pages_blocks_features_columns" AS ENUM('1', '2', '3', '4');
  CREATE TYPE "payload"."enum_pages_blocks_stats_stats_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  CREATE TYPE "payload"."enum_pages_blocks_contact_methods_methods_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_buttons_variant" AS ENUM('default', 'outline');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_background" AS ENUM('gradient', 'grid');
  CREATE TYPE "payload"."enum__pages_v_blocks_features_features_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  CREATE TYPE "payload"."enum__pages_v_blocks_features_features_accent" AS ENUM('none', 'primary', 'secondary', 'accent', 'muted');
  CREATE TYPE "payload"."enum__pages_v_blocks_features_columns" AS ENUM('1', '2', '3', '4');
  CREATE TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  CREATE TYPE "payload"."enum__pages_v_blocks_contact_methods_methods_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  CREATE TABLE "payload"."pages_blocks_hero_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"link" varchar,
  	"variant" "payload"."enum_pages_blocks_hero_buttons_variant" DEFAULT 'default'
  );
  
  CREATE TABLE "payload"."pages_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"subtitle" varchar,
  	"description" varchar,
  	"background" "payload"."enum_pages_blocks_hero_background" DEFAULT 'gradient',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_features_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum_pages_blocks_features_features_icon",
  	"title" varchar,
  	"description" varchar,
  	"accent" "payload"."enum_pages_blocks_features_features_accent" DEFAULT 'none'
  );
  
  CREATE TABLE "payload"."pages_blocks_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"section_title" varchar,
  	"section_description" varchar,
  	"columns" "payload"."enum_pages_blocks_features_columns" DEFAULT '3',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_stats_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"label" varchar,
  	"icon" "payload"."enum_pages_blocks_stats_stats_icon"
  );
  
  CREATE TABLE "payload"."pages_blocks_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_contact_methods_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum_pages_blocks_contact_methods_methods_icon",
  	"label" varchar,
  	"value" varchar,
  	"link" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_contact_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"headline" varchar,
  	"description" varchar,
  	"button_text" varchar,
  	"button_link" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"link" varchar,
  	"variant" "payload"."enum__pages_v_blocks_hero_buttons_variant" DEFAULT 'default',
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"subtitle" varchar,
  	"description" varchar,
  	"background" "payload"."enum__pages_v_blocks_hero_background" DEFAULT 'gradient',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_features_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum__pages_v_blocks_features_features_icon",
  	"title" varchar,
  	"description" varchar,
  	"accent" "payload"."enum__pages_v_blocks_features_features_accent" DEFAULT 'none',
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"section_title" varchar,
  	"section_description" varchar,
  	"columns" "payload"."enum__pages_v_blocks_features_columns" DEFAULT '3',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stats_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"label" varchar,
  	"icon" "payload"."enum__pages_v_blocks_stats_stats_icon",
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_contact_methods_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum__pages_v_blocks_contact_methods_methods_icon",
  	"label" varchar,
  	"value" varchar,
  	"link" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_contact_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"headline" varchar,
  	"description" varchar,
  	"button_text" varchar,
  	"button_link" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );

  ALTER TABLE "payload"."pages_blocks_hero_buttons" ADD CONSTRAINT "pages_blocks_hero_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_features_features" ADD CONSTRAINT "pages_blocks_features_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_features" ADD CONSTRAINT "pages_blocks_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stats_stats" ADD CONSTRAINT "pages_blocks_stats_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stats" ADD CONSTRAINT "pages_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_contact_methods_methods" ADD CONSTRAINT "pages_blocks_contact_methods_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_contact_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_contact_methods" ADD CONSTRAINT "pages_blocks_contact_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD CONSTRAINT "pages_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero_buttons" ADD CONSTRAINT "_pages_v_blocks_hero_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_features_features" ADD CONSTRAINT "_pages_v_blocks_features_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_features" ADD CONSTRAINT "_pages_v_blocks_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats" ADD CONSTRAINT "_pages_v_blocks_stats_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stats" ADD CONSTRAINT "_pages_v_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_contact_methods_methods" ADD CONSTRAINT "_pages_v_blocks_contact_methods_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_contact_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_contact_methods" ADD CONSTRAINT "_pages_v_blocks_contact_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD CONSTRAINT "_pages_v_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_cta" ADD CONSTRAINT "_pages_v_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_hero_buttons_order_idx" ON "payload"."pages_blocks_hero_buttons" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_buttons_parent_id_idx" ON "payload"."pages_blocks_hero_buttons" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_order_idx" ON "payload"."pages_blocks_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_parent_id_idx" ON "payload"."pages_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_path_idx" ON "payload"."pages_blocks_hero" USING btree ("_path");
  CREATE INDEX "pages_blocks_features_features_order_idx" ON "payload"."pages_blocks_features_features" USING btree ("_order");
  CREATE INDEX "pages_blocks_features_features_parent_id_idx" ON "payload"."pages_blocks_features_features" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_features_order_idx" ON "payload"."pages_blocks_features" USING btree ("_order");
  CREATE INDEX "pages_blocks_features_parent_id_idx" ON "payload"."pages_blocks_features" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_features_path_idx" ON "payload"."pages_blocks_features" USING btree ("_path");
  CREATE INDEX "pages_blocks_stats_stats_order_idx" ON "payload"."pages_blocks_stats_stats" USING btree ("_order");
  CREATE INDEX "pages_blocks_stats_stats_parent_id_idx" ON "payload"."pages_blocks_stats_stats" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_stats_order_idx" ON "payload"."pages_blocks_stats" USING btree ("_order");
  CREATE INDEX "pages_blocks_stats_parent_id_idx" ON "payload"."pages_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_stats_path_idx" ON "payload"."pages_blocks_stats" USING btree ("_path");
  CREATE INDEX "pages_blocks_contact_methods_methods_order_idx" ON "payload"."pages_blocks_contact_methods_methods" USING btree ("_order");
  CREATE INDEX "pages_blocks_contact_methods_methods_parent_id_idx" ON "payload"."pages_blocks_contact_methods_methods" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_contact_methods_order_idx" ON "payload"."pages_blocks_contact_methods" USING btree ("_order");
  CREATE INDEX "pages_blocks_contact_methods_parent_id_idx" ON "payload"."pages_blocks_contact_methods" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_contact_methods_path_idx" ON "payload"."pages_blocks_contact_methods" USING btree ("_path");
  CREATE INDEX "pages_blocks_rich_text_order_idx" ON "payload"."pages_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_rich_text_parent_id_idx" ON "payload"."pages_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_rich_text_path_idx" ON "payload"."pages_blocks_rich_text" USING btree ("_path");
  CREATE INDEX "pages_blocks_cta_order_idx" ON "payload"."pages_blocks_cta" USING btree ("_order");
  CREATE INDEX "pages_blocks_cta_parent_id_idx" ON "payload"."pages_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_cta_path_idx" ON "payload"."pages_blocks_cta" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_hero_buttons_order_idx" ON "payload"."_pages_v_blocks_hero_buttons" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_buttons_parent_id_idx" ON "payload"."_pages_v_blocks_hero_buttons" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_order_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_parent_id_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_path_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_features_features_order_idx" ON "payload"."_pages_v_blocks_features_features" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_features_features_parent_id_idx" ON "payload"."_pages_v_blocks_features_features" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_features_order_idx" ON "payload"."_pages_v_blocks_features" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_features_parent_id_idx" ON "payload"."_pages_v_blocks_features" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_features_path_idx" ON "payload"."_pages_v_blocks_features" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_stats_stats_order_idx" ON "payload"."_pages_v_blocks_stats_stats" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stats_stats_parent_id_idx" ON "payload"."_pages_v_blocks_stats_stats" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_stats_order_idx" ON "payload"."_pages_v_blocks_stats" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stats_parent_id_idx" ON "payload"."_pages_v_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_stats_path_idx" ON "payload"."_pages_v_blocks_stats" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_contact_methods_methods_order_idx" ON "payload"."_pages_v_blocks_contact_methods_methods" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_contact_methods_methods_parent_id_idx" ON "payload"."_pages_v_blocks_contact_methods_methods" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_contact_methods_order_idx" ON "payload"."_pages_v_blocks_contact_methods" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_contact_methods_parent_id_idx" ON "payload"."_pages_v_blocks_contact_methods" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_contact_methods_path_idx" ON "payload"."_pages_v_blocks_contact_methods" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_rich_text_order_idx" ON "payload"."_pages_v_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_rich_text_parent_id_idx" ON "payload"."_pages_v_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_path_idx" ON "payload"."_pages_v_blocks_rich_text" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_cta_order_idx" ON "payload"."_pages_v_blocks_cta" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_cta_parent_id_idx" ON "payload"."_pages_v_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_path_idx" ON "payload"."_pages_v_blocks_cta" USING btree ("_path");
  ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "content";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN IF EXISTS "version_content";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_blocks_hero_buttons" CASCADE;
  DROP TABLE "payload"."pages_blocks_hero" CASCADE;
  DROP TABLE "payload"."pages_blocks_features_features" CASCADE;
  DROP TABLE "payload"."pages_blocks_features" CASCADE;
  DROP TABLE "payload"."pages_blocks_stats_stats" CASCADE;
  DROP TABLE "payload"."pages_blocks_stats" CASCADE;
  DROP TABLE "payload"."pages_blocks_contact_methods_methods" CASCADE;
  DROP TABLE "payload"."pages_blocks_contact_methods" CASCADE;
  DROP TABLE "payload"."pages_blocks_rich_text" CASCADE;
  DROP TABLE "payload"."pages_blocks_cta" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero_buttons" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_features_features" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_features" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stats_stats" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stats" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_contact_methods_methods" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_contact_methods" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_rich_text" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_cta" CASCADE;
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'quota-reset', 'cache-cleanup');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'quota-reset', 'cache-cleanup');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."pages" ADD COLUMN "content" jsonb;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_content" jsonb;
  DROP TYPE "payload"."enum_pages_blocks_hero_buttons_variant";
  DROP TYPE "payload"."enum_pages_blocks_hero_background";
  DROP TYPE "payload"."enum_pages_blocks_features_features_icon";
  DROP TYPE "payload"."enum_pages_blocks_features_features_accent";
  DROP TYPE "payload"."enum_pages_blocks_features_columns";
  DROP TYPE "payload"."enum_pages_blocks_stats_stats_icon";
  DROP TYPE "payload"."enum_pages_blocks_contact_methods_methods_icon";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_buttons_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_background";
  DROP TYPE "payload"."enum__pages_v_blocks_features_features_icon";
  DROP TYPE "payload"."enum__pages_v_blocks_features_features_accent";
  DROP TYPE "payload"."enum__pages_v_blocks_features_columns";
  DROP TYPE "payload"."enum__pages_v_blocks_stats_stats_icon";
  DROP TYPE "payload"."enum__pages_v_blocks_contact_methods_methods_icon";`)
}
