import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."catalogs_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar
  );
  
  CREATE TABLE "payload"."_catalogs_v_version_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"tag" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "payload"."catalogs" ADD COLUMN "license" varchar;
  ALTER TABLE "payload"."catalogs" ADD COLUMN "source_url" varchar;
  ALTER TABLE "payload"."catalogs" ADD COLUMN "category" varchar;
  ALTER TABLE "payload"."catalogs" ADD COLUMN "region" varchar;
  ALTER TABLE "payload"."catalogs" ADD COLUMN "publisher_name" varchar;
  ALTER TABLE "payload"."catalogs" ADD COLUMN "publisher_url" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_license" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_source_url" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_category" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_region" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_publisher_name" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_publisher_url" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "license" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "source_url" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_license" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_source_url" varchar;
  ALTER TABLE "payload"."catalogs_tags" ADD CONSTRAINT "catalogs_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_catalogs_v_version_tags" ADD CONSTRAINT "_catalogs_v_version_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_catalogs_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "catalogs_tags_order_idx" ON "payload"."catalogs_tags" USING btree ("_order");
  CREATE INDEX "catalogs_tags_parent_id_idx" ON "payload"."catalogs_tags" USING btree ("_parent_id");
  CREATE INDEX "_catalogs_v_version_tags_order_idx" ON "payload"."_catalogs_v_version_tags" USING btree ("_order");
  CREATE INDEX "_catalogs_v_version_tags_parent_id_idx" ON "payload"."_catalogs_v_version_tags" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."catalogs_tags" CASCADE;
  DROP TABLE "payload"."_catalogs_v_version_tags" CASCADE;
  ALTER TABLE "payload"."catalogs" DROP COLUMN "license";
  ALTER TABLE "payload"."catalogs" DROP COLUMN "source_url";
  ALTER TABLE "payload"."catalogs" DROP COLUMN "category";
  ALTER TABLE "payload"."catalogs" DROP COLUMN "region";
  ALTER TABLE "payload"."catalogs" DROP COLUMN "publisher_name";
  ALTER TABLE "payload"."catalogs" DROP COLUMN "publisher_url";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_license";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_source_url";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_category";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_region";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_publisher_name";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_publisher_url";
  ALTER TABLE "payload"."datasets" DROP COLUMN "license";
  ALTER TABLE "payload"."datasets" DROP COLUMN "source_url";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_license";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_source_url";`)
}
