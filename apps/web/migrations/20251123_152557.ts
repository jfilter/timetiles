import type { MigrateUpArgs, MigrateDownArgs} from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_footer_social_links_platform" AS ENUM('x', 'bluesky', 'mastodon', 'github', 'linkedin', 'facebook', 'instagram', 'youtube');
  CREATE TYPE "payload"."enum__footer_v_version_social_links_platform" AS ENUM('x', 'bluesky', 'mastodon', 'github', 'linkedin', 'facebook', 'instagram', 'youtube');
  CREATE TABLE "payload"."footer_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "payload"."enum_footer_social_links_platform",
  	"url" varchar
  );
  
  CREATE TABLE "payload"."_footer_v_version_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"platform" "payload"."enum__footer_v_version_social_links_platform",
  	"url" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "payload"."footer_social_links" ADD CONSTRAINT "footer_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_footer_v_version_social_links" ADD CONSTRAINT "_footer_v_version_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_footer_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "footer_social_links_order_idx" ON "payload"."footer_social_links" USING btree ("_order");
  CREATE INDEX "footer_social_links_parent_id_idx" ON "payload"."footer_social_links" USING btree ("_parent_id");
  CREATE INDEX "_footer_v_version_social_links_order_idx" ON "payload"."_footer_v_version_social_links" USING btree ("_order");
  CREATE INDEX "_footer_v_version_social_links_parent_id_idx" ON "payload"."_footer_v_version_social_links" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."footer_social_links" CASCADE;
  DROP TABLE "payload"."_footer_v_version_social_links" CASCADE;
  DROP TYPE "payload"."enum_footer_social_links_platform";
  DROP TYPE "payload"."enum__footer_v_version_social_links_platform";`)
}
