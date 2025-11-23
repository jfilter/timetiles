import { sql } from '@payloadcms/db-postgres'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_details_grid_items_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum_pages_blocks_details_grid_variant" AS ENUM('grid-2', 'grid-3', 'grid-4', 'compact');
  CREATE TYPE "payload"."enum_pages_blocks_timeline_variant" AS ENUM('vertical', 'compact');
  CREATE TYPE "payload"."enum_pages_blocks_testimonials_items_avatar" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum_pages_blocks_testimonials_variant" AS ENUM('grid', 'single', 'masonry');
  CREATE TYPE "payload"."enum__pages_v_blocks_details_grid_items_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum__pages_v_blocks_details_grid_variant" AS ENUM('grid-2', 'grid-3', 'grid-4', 'compact');
  CREATE TYPE "payload"."enum__pages_v_blocks_timeline_variant" AS ENUM('vertical', 'compact');
  CREATE TYPE "payload"."enum__pages_v_blocks_testimonials_items_avatar" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights', 'github', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram', 'youtube', 'x');
  CREATE TYPE "payload"."enum__pages_v_blocks_testimonials_variant" AS ENUM('grid', 'single', 'masonry');
  ALTER TYPE "payload"."enum_pages_blocks_features_features_icon" ADD VALUE 'github';
  ALTER TYPE "payload"."enum_pages_blocks_features_features_icon" ADD VALUE 'bluesky';
  ALTER TYPE "payload"."enum_pages_blocks_features_features_icon" ADD VALUE 'mastodon';
  ALTER TYPE "payload"."enum_pages_blocks_features_features_icon" ADD VALUE 'linkedin';
  ALTER TYPE "payload"."enum_pages_blocks_features_features_icon" ADD VALUE 'facebook';
  ALTER TYPE "payload"."enum_pages_blocks_features_features_icon" ADD VALUE 'instagram';
  ALTER TYPE "payload"."enum_pages_blocks_features_features_icon" ADD VALUE 'youtube';
  ALTER TYPE "payload"."enum_pages_blocks_features_features_icon" ADD VALUE 'x';
  ALTER TYPE "payload"."enum_pages_blocks_stats_stats_icon" ADD VALUE 'github';
  ALTER TYPE "payload"."enum_pages_blocks_stats_stats_icon" ADD VALUE 'bluesky';
  ALTER TYPE "payload"."enum_pages_blocks_stats_stats_icon" ADD VALUE 'mastodon';
  ALTER TYPE "payload"."enum_pages_blocks_stats_stats_icon" ADD VALUE 'linkedin';
  ALTER TYPE "payload"."enum_pages_blocks_stats_stats_icon" ADD VALUE 'facebook';
  ALTER TYPE "payload"."enum_pages_blocks_stats_stats_icon" ADD VALUE 'instagram';
  ALTER TYPE "payload"."enum_pages_blocks_stats_stats_icon" ADD VALUE 'youtube';
  ALTER TYPE "payload"."enum_pages_blocks_stats_stats_icon" ADD VALUE 'x';
  ALTER TYPE "payload"."enum__pages_v_blocks_features_features_icon" ADD VALUE 'github';
  ALTER TYPE "payload"."enum__pages_v_blocks_features_features_icon" ADD VALUE 'bluesky';
  ALTER TYPE "payload"."enum__pages_v_blocks_features_features_icon" ADD VALUE 'mastodon';
  ALTER TYPE "payload"."enum__pages_v_blocks_features_features_icon" ADD VALUE 'linkedin';
  ALTER TYPE "payload"."enum__pages_v_blocks_features_features_icon" ADD VALUE 'facebook';
  ALTER TYPE "payload"."enum__pages_v_blocks_features_features_icon" ADD VALUE 'instagram';
  ALTER TYPE "payload"."enum__pages_v_blocks_features_features_icon" ADD VALUE 'youtube';
  ALTER TYPE "payload"."enum__pages_v_blocks_features_features_icon" ADD VALUE 'x';
  ALTER TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" ADD VALUE 'github';
  ALTER TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" ADD VALUE 'bluesky';
  ALTER TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" ADD VALUE 'mastodon';
  ALTER TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" ADD VALUE 'linkedin';
  ALTER TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" ADD VALUE 'facebook';
  ALTER TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" ADD VALUE 'instagram';
  ALTER TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" ADD VALUE 'youtube';
  ALTER TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" ADD VALUE 'x';
  CREATE TABLE "payload"."pages_blocks_details_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum_pages_blocks_details_grid_items_icon",
  	"label" varchar,
  	"value" varchar,
  	"link" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_details_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"section_title" varchar,
  	"variant" "payload"."enum_pages_blocks_details_grid_variant" DEFAULT 'grid-3',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" varchar,
  	"title" varchar,
  	"description" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"section_title" varchar,
  	"variant" "payload"."enum_pages_blocks_timeline_variant" DEFAULT 'vertical',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"author" varchar,
  	"role" varchar,
  	"avatar" "payload"."enum_pages_blocks_testimonials_items_avatar"
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"section_title" varchar,
  	"variant" "payload"."enum_pages_blocks_testimonials_variant" DEFAULT 'grid',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_details_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "payload"."enum__pages_v_blocks_details_grid_items_icon",
  	"label" varchar,
  	"value" varchar,
  	"link" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_details_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"section_title" varchar,
  	"variant" "payload"."enum__pages_v_blocks_details_grid_variant" DEFAULT 'grid-3',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"date" varchar,
  	"title" varchar,
  	"description" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"section_title" varchar,
  	"variant" "payload"."enum__pages_v_blocks_timeline_variant" DEFAULT 'vertical',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"author" varchar,
  	"role" varchar,
  	"avatar" "payload"."enum__pages_v_blocks_testimonials_items_avatar",
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"section_title" varchar,
  	"variant" "payload"."enum__pages_v_blocks_testimonials_variant" DEFAULT 'grid',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  DROP TABLE "payload"."pages_blocks_contact_methods_methods" CASCADE;
  DROP TABLE "payload"."pages_blocks_contact_methods" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_contact_methods_methods" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_contact_methods" CASCADE;
  ALTER TABLE "payload"."pages_blocks_details_grid_items" ADD CONSTRAINT "pages_blocks_details_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_details_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_details_grid" ADD CONSTRAINT "pages_blocks_details_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline_items" ADD CONSTRAINT "pages_blocks_timeline_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline" ADD CONSTRAINT "pages_blocks_timeline_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonials_items" ADD CONSTRAINT "pages_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonials" ADD CONSTRAINT "pages_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid_items" ADD CONSTRAINT "_pages_v_blocks_details_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_details_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_details_grid" ADD CONSTRAINT "_pages_v_blocks_details_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items" ADD CONSTRAINT "_pages_v_blocks_timeline_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD CONSTRAINT "_pages_v_blocks_timeline_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials_items" ADD CONSTRAINT "_pages_v_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonials" ADD CONSTRAINT "_pages_v_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_details_grid_items_order_idx" ON "payload"."pages_blocks_details_grid_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_details_grid_items_parent_id_idx" ON "payload"."pages_blocks_details_grid_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_details_grid_order_idx" ON "payload"."pages_blocks_details_grid" USING btree ("_order");
  CREATE INDEX "pages_blocks_details_grid_parent_id_idx" ON "payload"."pages_blocks_details_grid" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_details_grid_path_idx" ON "payload"."pages_blocks_details_grid" USING btree ("_path");
  CREATE INDEX "pages_blocks_timeline_items_order_idx" ON "payload"."pages_blocks_timeline_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_timeline_items_parent_id_idx" ON "payload"."pages_blocks_timeline_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_timeline_order_idx" ON "payload"."pages_blocks_timeline" USING btree ("_order");
  CREATE INDEX "pages_blocks_timeline_parent_id_idx" ON "payload"."pages_blocks_timeline" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_timeline_path_idx" ON "payload"."pages_blocks_timeline" USING btree ("_path");
  CREATE INDEX "pages_blocks_testimonials_items_order_idx" ON "payload"."pages_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonials_items_parent_id_idx" ON "payload"."pages_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonials_order_idx" ON "payload"."pages_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonials_parent_id_idx" ON "payload"."pages_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonials_path_idx" ON "payload"."pages_blocks_testimonials" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_details_grid_items_order_idx" ON "payload"."_pages_v_blocks_details_grid_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_details_grid_items_parent_id_idx" ON "payload"."_pages_v_blocks_details_grid_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_details_grid_order_idx" ON "payload"."_pages_v_blocks_details_grid" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_details_grid_parent_id_idx" ON "payload"."_pages_v_blocks_details_grid" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_details_grid_path_idx" ON "payload"."_pages_v_blocks_details_grid" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_timeline_items_order_idx" ON "payload"."_pages_v_blocks_timeline_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_timeline_items_parent_id_idx" ON "payload"."_pages_v_blocks_timeline_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_order_idx" ON "payload"."_pages_v_blocks_timeline" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_timeline_parent_id_idx" ON "payload"."_pages_v_blocks_timeline" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_path_idx" ON "payload"."_pages_v_blocks_timeline" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_testimonials_items_order_idx" ON "payload"."_pages_v_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonials_items_parent_id_idx" ON "payload"."_pages_v_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_order_idx" ON "payload"."_pages_v_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonials_parent_id_idx" ON "payload"."_pages_v_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_path_idx" ON "payload"."_pages_v_blocks_testimonials" USING btree ("_path");
  DROP TYPE "payload"."enum_pages_blocks_contact_methods_methods_icon";
  DROP TYPE "payload"."enum__pages_v_blocks_contact_methods_methods_icon";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_contact_methods_methods_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  CREATE TYPE "payload"."enum__pages_v_blocks_contact_methods_methods_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
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
  
  DROP TABLE "payload"."pages_blocks_details_grid_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_details_grid" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonials_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonials" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_details_grid_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_details_grid" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonials_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonials" CASCADE;
  ALTER TABLE "payload"."pages_blocks_features_features" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "payload"."enum_pages_blocks_features_features_icon";
  CREATE TYPE "payload"."enum_pages_blocks_features_features_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  ALTER TABLE "payload"."pages_blocks_features_features" ALTER COLUMN "icon" SET DATA TYPE "payload"."enum_pages_blocks_features_features_icon" USING "icon"::"payload"."enum_pages_blocks_features_features_icon";
  ALTER TABLE "payload"."pages_blocks_stats_stats" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "payload"."enum_pages_blocks_stats_stats_icon";
  CREATE TYPE "payload"."enum_pages_blocks_stats_stats_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  ALTER TABLE "payload"."pages_blocks_stats_stats" ALTER COLUMN "icon" SET DATA TYPE "payload"."enum_pages_blocks_stats_stats_icon" USING "icon"::"payload"."enum_pages_blocks_stats_stats_icon";
  ALTER TABLE "payload"."_pages_v_blocks_features_features" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "payload"."enum__pages_v_blocks_features_features_icon";
  CREATE TYPE "payload"."enum__pages_v_blocks_features_features_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  ALTER TABLE "payload"."_pages_v_blocks_features_features" ALTER COLUMN "icon" SET DATA TYPE "payload"."enum__pages_v_blocks_features_features_icon" USING "icon"::"payload"."enum__pages_v_blocks_features_features_icon";
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "payload"."enum__pages_v_blocks_stats_stats_icon";
  CREATE TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" AS ENUM('email', 'business', 'support', 'location', 'map', 'timeline', 'insights');
  ALTER TABLE "payload"."_pages_v_blocks_stats_stats" ALTER COLUMN "icon" SET DATA TYPE "payload"."enum__pages_v_blocks_stats_stats_icon" USING "icon"::"payload"."enum__pages_v_blocks_stats_stats_icon";
  ALTER TABLE "payload"."pages_blocks_contact_methods_methods" ADD CONSTRAINT "pages_blocks_contact_methods_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_contact_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_contact_methods" ADD CONSTRAINT "pages_blocks_contact_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_contact_methods_methods" ADD CONSTRAINT "_pages_v_blocks_contact_methods_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_contact_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_contact_methods" ADD CONSTRAINT "_pages_v_blocks_contact_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_contact_methods_methods_order_idx" ON "payload"."pages_blocks_contact_methods_methods" USING btree ("_order");
  CREATE INDEX "pages_blocks_contact_methods_methods_parent_id_idx" ON "payload"."pages_blocks_contact_methods_methods" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_contact_methods_order_idx" ON "payload"."pages_blocks_contact_methods" USING btree ("_order");
  CREATE INDEX "pages_blocks_contact_methods_parent_id_idx" ON "payload"."pages_blocks_contact_methods" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_contact_methods_path_idx" ON "payload"."pages_blocks_contact_methods" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_contact_methods_methods_order_idx" ON "payload"."_pages_v_blocks_contact_methods_methods" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_contact_methods_methods_parent_id_idx" ON "payload"."_pages_v_blocks_contact_methods_methods" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_contact_methods_order_idx" ON "payload"."_pages_v_blocks_contact_methods" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_contact_methods_parent_id_idx" ON "payload"."_pages_v_blocks_contact_methods" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_contact_methods_path_idx" ON "payload"."_pages_v_blocks_contact_methods" USING btree ("_path");
  DROP TYPE "payload"."enum_pages_blocks_details_grid_items_icon";
  DROP TYPE "payload"."enum_pages_blocks_details_grid_variant";
  DROP TYPE "payload"."enum_pages_blocks_timeline_variant";
  DROP TYPE "payload"."enum_pages_blocks_testimonials_items_avatar";
  DROP TYPE "payload"."enum_pages_blocks_testimonials_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_details_grid_items_icon";
  DROP TYPE "payload"."enum__pages_v_blocks_details_grid_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_timeline_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_testimonials_items_avatar";
  DROP TYPE "payload"."enum__pages_v_blocks_testimonials_variant";`)
}
