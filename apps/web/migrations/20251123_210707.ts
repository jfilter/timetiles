import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_newsletter_c_t_a_variant" AS ENUM('default', 'elevated', 'centered');
  CREATE TYPE "payload"."enum_pages_blocks_newsletter_c_t_a_size" AS ENUM('default', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_newsletter_c_t_a_variant" AS ENUM('default', 'elevated', 'centered');
  CREATE TYPE "payload"."enum__pages_v_blocks_newsletter_c_t_a_size" AS ENUM('default', 'lg', 'xl');
  CREATE TABLE "payload"."pages_blocks_newsletter_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"headline" varchar DEFAULT 'Stay Mapped In',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_newsletter_c_t_a" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"headline" varchar DEFAULT 'Never Miss a Discovery',
  	"description" varchar DEFAULT 'Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe to Updates',
  	"variant" "payload"."enum_pages_blocks_newsletter_c_t_a_variant" DEFAULT 'default',
  	"size" "payload"."enum_pages_blocks_newsletter_c_t_a_size" DEFAULT 'default',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_newsletter_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"headline" varchar DEFAULT 'Stay Mapped In',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"headline" varchar DEFAULT 'Never Miss a Discovery',
  	"description" varchar DEFAULT 'Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.',
  	"placeholder" varchar DEFAULT 'your@email.address',
  	"button_text" varchar DEFAULT 'Subscribe to Updates',
  	"variant" "payload"."enum__pages_v_blocks_newsletter_c_t_a_variant" DEFAULT 'default',
  	"size" "payload"."enum__pages_v_blocks_newsletter_c_t_a_size" DEFAULT 'default',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"newsletter_service_url" varchar,
  	"newsletter_auth_header" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."pages_blocks_newsletter_form" ADD CONSTRAINT "pages_blocks_newsletter_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_newsletter_c_t_a" ADD CONSTRAINT "pages_blocks_newsletter_c_t_a_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_form" ADD CONSTRAINT "_pages_v_blocks_newsletter_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" ADD CONSTRAINT "_pages_v_blocks_newsletter_c_t_a_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_newsletter_form_order_idx" ON "payload"."pages_blocks_newsletter_form" USING btree ("_order");
  CREATE INDEX "pages_blocks_newsletter_form_parent_id_idx" ON "payload"."pages_blocks_newsletter_form" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_newsletter_form_path_idx" ON "payload"."pages_blocks_newsletter_form" USING btree ("_path");
  CREATE INDEX "pages_blocks_newsletter_c_t_a_order_idx" ON "payload"."pages_blocks_newsletter_c_t_a" USING btree ("_order");
  CREATE INDEX "pages_blocks_newsletter_c_t_a_parent_id_idx" ON "payload"."pages_blocks_newsletter_c_t_a" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_newsletter_c_t_a_path_idx" ON "payload"."pages_blocks_newsletter_c_t_a" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_newsletter_form_order_idx" ON "payload"."_pages_v_blocks_newsletter_form" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_newsletter_form_parent_id_idx" ON "payload"."_pages_v_blocks_newsletter_form" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_newsletter_form_path_idx" ON "payload"."_pages_v_blocks_newsletter_form" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_newsletter_c_t_a_order_idx" ON "payload"."_pages_v_blocks_newsletter_c_t_a" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_newsletter_c_t_a_parent_id_idx" ON "payload"."_pages_v_blocks_newsletter_c_t_a" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_newsletter_c_t_a_path_idx" ON "payload"."_pages_v_blocks_newsletter_c_t_a" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_blocks_newsletter_form" CASCADE;
  DROP TABLE "payload"."pages_blocks_newsletter_c_t_a" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_newsletter_form" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_newsletter_c_t_a" CASCADE;
  DROP TABLE "payload"."settings" CASCADE;
  DROP TYPE "payload"."enum_pages_blocks_newsletter_c_t_a_variant";
  DROP TYPE "payload"."enum_pages_blocks_newsletter_c_t_a_size";
  DROP TYPE "payload"."enum__pages_v_blocks_newsletter_c_t_a_variant";
  DROP TYPE "payload"."enum__pages_v_blocks_newsletter_c_t_a_size";`)
}
