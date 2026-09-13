import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."datasets_id_strategy_computed_id_fields" CASCADE;
  DROP TABLE "payload"."_datasets_v_version_id_strategy_computed_id_fields" CASCADE;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."datasets_id_strategy_computed_id_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field_path" varchar
  );
  
  CREATE TABLE "payload"."_datasets_v_version_id_strategy_computed_id_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "payload"."datasets_id_strategy_computed_id_fields" ADD CONSTRAINT "datasets_id_strategy_computed_id_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_id_strategy_computed_id_fields" ADD CONSTRAINT "_datasets_v_version_id_strategy_computed_id_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "datasets_id_strategy_computed_id_fields_order_idx" ON "payload"."datasets_id_strategy_computed_id_fields" USING btree ("_order");
  CREATE INDEX "datasets_id_strategy_computed_id_fields_parent_id_idx" ON "payload"."datasets_id_strategy_computed_id_fields" USING btree ("_parent_id");
  CREATE INDEX "_datasets_v_version_id_strategy_computed_id_fields_order_idx" ON "payload"."_datasets_v_version_id_strategy_computed_id_fields" USING btree ("_order");
  CREATE INDEX "_datasets_v_version_id_strategy_computed_id_fields_parent_id_idx" ON "payload"."_datasets_v_version_id_strategy_computed_id_fields" USING btree ("_parent_id");`)
}
