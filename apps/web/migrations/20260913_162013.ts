import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."_media_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."_media_v" CASCADE;
  DROP INDEX "payload"."media__status_idx";
  ALTER TABLE "payload"."media" DROP COLUMN "_status";
  DROP TYPE "payload"."enum_media_status";
  DROP TYPE "payload"."enum__media_v_version_status";
  DROP TYPE "payload"."enum__media_v_published_locale";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_media_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__media_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__media_v_published_locale" AS ENUM('en', 'de');
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
  
  ALTER TABLE "payload"."media" ADD COLUMN "_status" "payload"."enum_media_status" DEFAULT 'draft';
  ALTER TABLE "payload"."_media_v" ADD CONSTRAINT "_media_v_parent_id_media_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_media_v" ADD CONSTRAINT "_media_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
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
  CREATE INDEX "media__status_idx" ON "payload"."media" USING btree ("_status");`)
}
