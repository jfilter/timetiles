import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."catalogs_coverage_countries" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"code" varchar
  );
  
  CREATE TABLE "payload"."_catalogs_v_version_coverage_countries" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."datasets_coverage_countries" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"code" varchar
  );
  
  CREATE TABLE "payload"."_datasets_v_version_coverage_countries" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "payload"."catalogs" ADD COLUMN "publisher_acronym" varchar;
  ALTER TABLE "payload"."catalogs" ADD COLUMN "publisher_description" varchar;
  ALTER TABLE "payload"."catalogs" ADD COLUMN "publisher_country" varchar;
  ALTER TABLE "payload"."catalogs" ADD COLUMN "publisher_official" boolean DEFAULT false;
  ALTER TABLE "payload"."catalogs" ADD COLUMN "coverage_start" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_publisher_acronym" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_publisher_description" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_publisher_country" varchar;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_publisher_official" boolean DEFAULT false;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_coverage_start" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "publisher_name" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "publisher_url" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "publisher_acronym" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "publisher_description" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "publisher_country" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "publisher_official" boolean DEFAULT false;
  ALTER TABLE "payload"."datasets" ADD COLUMN "coverage_start" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_publisher_name" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_publisher_url" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_publisher_acronym" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_publisher_description" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_publisher_country" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_publisher_official" boolean DEFAULT false;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_coverage_start" varchar;
  ALTER TABLE "payload"."catalogs_coverage_countries" ADD CONSTRAINT "catalogs_coverage_countries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_catalogs_v_version_coverage_countries" ADD CONSTRAINT "_catalogs_v_version_coverage_countries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_catalogs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."datasets_coverage_countries" ADD CONSTRAINT "datasets_coverage_countries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_coverage_countries" ADD CONSTRAINT "_datasets_v_version_coverage_countries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "catalogs_coverage_countries_order_idx" ON "payload"."catalogs_coverage_countries" USING btree ("_order");
  CREATE INDEX "catalogs_coverage_countries_parent_id_idx" ON "payload"."catalogs_coverage_countries" USING btree ("_parent_id");
  CREATE INDEX "_catalogs_v_version_coverage_countries_order_idx" ON "payload"."_catalogs_v_version_coverage_countries" USING btree ("_order");
  CREATE INDEX "_catalogs_v_version_coverage_countries_parent_id_idx" ON "payload"."_catalogs_v_version_coverage_countries" USING btree ("_parent_id");
  CREATE INDEX "datasets_coverage_countries_order_idx" ON "payload"."datasets_coverage_countries" USING btree ("_order");
  CREATE INDEX "datasets_coverage_countries_parent_id_idx" ON "payload"."datasets_coverage_countries" USING btree ("_parent_id");
  CREATE INDEX "_datasets_v_version_coverage_countries_order_idx" ON "payload"."_datasets_v_version_coverage_countries" USING btree ("_order");
  CREATE INDEX "_datasets_v_version_coverage_countries_parent_id_idx" ON "payload"."_datasets_v_version_coverage_countries" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."catalogs_coverage_countries" CASCADE;
  DROP TABLE "payload"."_catalogs_v_version_coverage_countries" CASCADE;
  DROP TABLE "payload"."datasets_coverage_countries" CASCADE;
  DROP TABLE "payload"."_datasets_v_version_coverage_countries" CASCADE;
  ALTER TABLE "payload"."catalogs" DROP COLUMN "publisher_acronym";
  ALTER TABLE "payload"."catalogs" DROP COLUMN "publisher_description";
  ALTER TABLE "payload"."catalogs" DROP COLUMN "publisher_country";
  ALTER TABLE "payload"."catalogs" DROP COLUMN "publisher_official";
  ALTER TABLE "payload"."catalogs" DROP COLUMN "coverage_start";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_publisher_acronym";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_publisher_description";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_publisher_country";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_publisher_official";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_coverage_start";
  ALTER TABLE "payload"."datasets" DROP COLUMN "publisher_name";
  ALTER TABLE "payload"."datasets" DROP COLUMN "publisher_url";
  ALTER TABLE "payload"."datasets" DROP COLUMN "publisher_acronym";
  ALTER TABLE "payload"."datasets" DROP COLUMN "publisher_description";
  ALTER TABLE "payload"."datasets" DROP COLUMN "publisher_country";
  ALTER TABLE "payload"."datasets" DROP COLUMN "publisher_official";
  ALTER TABLE "payload"."datasets" DROP COLUMN "coverage_start";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_publisher_name";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_publisher_url";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_publisher_acronym";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_publisher_description";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_publisher_country";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_publisher_official";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_coverage_start";`)
}
