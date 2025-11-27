import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."branding" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_name" varchar DEFAULT 'TimeTiles',
  	"site_description" varchar DEFAULT 'Making spatial and temporal data analysis accessible to everyone.',
  	"logo_light_id" integer,
  	"logo_dark_id" integer,
  	"favicon_source_light_id" integer,
  	"favicon_source_dark_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."branding" ADD CONSTRAINT "branding_logo_light_id_media_id_fk" FOREIGN KEY ("logo_light_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."branding" ADD CONSTRAINT "branding_logo_dark_id_media_id_fk" FOREIGN KEY ("logo_dark_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."branding" ADD CONSTRAINT "branding_favicon_source_light_id_media_id_fk" FOREIGN KEY ("favicon_source_light_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."branding" ADD CONSTRAINT "branding_favicon_source_dark_id_media_id_fk" FOREIGN KEY ("favicon_source_dark_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "branding_logo_light_idx" ON "payload"."branding" USING btree ("logo_light_id");
  CREATE INDEX "branding_logo_dark_idx" ON "payload"."branding" USING btree ("logo_dark_id");
  CREATE INDEX "branding_favicon_source_light_idx" ON "payload"."branding" USING btree ("favicon_source_light_id");
  CREATE INDEX "branding_favicon_source_dark_idx" ON "payload"."branding" USING btree ("favicon_source_dark_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."branding" CASCADE;`)
}
