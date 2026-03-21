import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."settings_locales" (
  	"legal_registration_disclaimer" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."settings" ADD COLUMN "legal_terms_url" varchar;
  ALTER TABLE "payload"."settings" ADD COLUMN "legal_privacy_url" varchar;
  ALTER TABLE "payload"."settings_locales" ADD CONSTRAINT "settings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "settings_locales_locale_parent_id_unique" ON "payload"."settings_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."settings_locales" CASCADE;
  ALTER TABLE "payload"."settings" DROP COLUMN "legal_terms_url";
  ALTER TABLE "payload"."settings" DROP COLUMN "legal_privacy_url";`)
}
