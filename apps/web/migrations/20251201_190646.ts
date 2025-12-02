import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_scheduled_imports_schema_mode" AS ENUM('strict', 'additive', 'flexible');
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_schema_mode" AS ENUM('strict', 'additive', 'flexible');
  ALTER TABLE "payload"."import_files" ADD COLUMN "processing_options" jsonb;
  ALTER TABLE "payload"."import_files" ADD COLUMN "target_dataset_id" integer;
  ALTER TABLE "payload"."import_files" ADD COLUMN "scheduled_import_id" integer;
  ALTER TABLE "payload"."_import_files_v" ADD COLUMN "version_processing_options" jsonb;
  ALTER TABLE "payload"."_import_files_v" ADD COLUMN "version_target_dataset_id" integer;
  ALTER TABLE "payload"."_import_files_v" ADD COLUMN "version_scheduled_import_id" integer;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "schema_mode" "payload"."enum_scheduled_imports_schema_mode" DEFAULT 'additive';
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "source_import_file_id" integer;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_schema_mode" "payload"."enum__scheduled_imports_v_version_schema_mode" DEFAULT 'additive';
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_source_import_file_id" integer;
  ALTER TABLE "payload"."import_files" ADD CONSTRAINT "import_files_target_dataset_id_datasets_id_fk" FOREIGN KEY ("target_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."import_files" ADD CONSTRAINT "import_files_scheduled_import_id_scheduled_imports_id_fk" FOREIGN KEY ("scheduled_import_id") REFERENCES "payload"."scheduled_imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_files_v" ADD CONSTRAINT "_import_files_v_version_target_dataset_id_datasets_id_fk" FOREIGN KEY ("version_target_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_files_v" ADD CONSTRAINT "_import_files_v_version_scheduled_import_id_scheduled_imports_id_fk" FOREIGN KEY ("version_scheduled_import_id") REFERENCES "payload"."scheduled_imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_imports" ADD CONSTRAINT "scheduled_imports_source_import_file_id_import_files_id_fk" FOREIGN KEY ("source_import_file_id") REFERENCES "payload"."import_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD CONSTRAINT "_scheduled_imports_v_version_source_import_file_id_import_files_id_fk" FOREIGN KEY ("version_source_import_file_id") REFERENCES "payload"."import_files"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "import_files_target_dataset_idx" ON "payload"."import_files" USING btree ("target_dataset_id");
  CREATE INDEX "import_files_scheduled_import_idx" ON "payload"."import_files" USING btree ("scheduled_import_id");
  CREATE INDEX "_import_files_v_version_version_target_dataset_idx" ON "payload"."_import_files_v" USING btree ("version_target_dataset_id");
  CREATE INDEX "_import_files_v_version_version_scheduled_import_idx" ON "payload"."_import_files_v" USING btree ("version_scheduled_import_id");
  CREATE INDEX "scheduled_imports_source_import_file_idx" ON "payload"."scheduled_imports" USING btree ("source_import_file_id");
  CREATE INDEX "_scheduled_imports_v_version_version_source_import_file_idx" ON "payload"."_scheduled_imports_v" USING btree ("version_source_import_file_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_files" DROP CONSTRAINT "import_files_target_dataset_id_datasets_id_fk";
  
  ALTER TABLE "payload"."import_files" DROP CONSTRAINT "import_files_scheduled_import_id_scheduled_imports_id_fk";
  
  ALTER TABLE "payload"."_import_files_v" DROP CONSTRAINT "_import_files_v_version_target_dataset_id_datasets_id_fk";
  
  ALTER TABLE "payload"."_import_files_v" DROP CONSTRAINT "_import_files_v_version_scheduled_import_id_scheduled_imports_id_fk";
  
  ALTER TABLE "payload"."scheduled_imports" DROP CONSTRAINT "scheduled_imports_source_import_file_id_import_files_id_fk";
  
  ALTER TABLE "payload"."_scheduled_imports_v" DROP CONSTRAINT "_scheduled_imports_v_version_source_import_file_id_import_files_id_fk";
  
  DROP INDEX "payload"."import_files_target_dataset_idx";
  DROP INDEX "payload"."import_files_scheduled_import_idx";
  DROP INDEX "payload"."_import_files_v_version_version_target_dataset_idx";
  DROP INDEX "payload"."_import_files_v_version_version_scheduled_import_idx";
  DROP INDEX "payload"."scheduled_imports_source_import_file_idx";
  DROP INDEX "payload"."_scheduled_imports_v_version_version_source_import_file_idx";
  ALTER TABLE "payload"."import_files" DROP COLUMN "processing_options";
  ALTER TABLE "payload"."import_files" DROP COLUMN "target_dataset_id";
  ALTER TABLE "payload"."import_files" DROP COLUMN "scheduled_import_id";
  ALTER TABLE "payload"."_import_files_v" DROP COLUMN "version_processing_options";
  ALTER TABLE "payload"."_import_files_v" DROP COLUMN "version_target_dataset_id";
  ALTER TABLE "payload"."_import_files_v" DROP COLUMN "version_scheduled_import_id";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "schema_mode";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "source_import_file_id";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_schema_mode";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_source_import_file_id";
  DROP TYPE "payload"."enum_scheduled_imports_schema_mode";
  DROP TYPE "payload"."enum__scheduled_imports_v_version_schema_mode";`)
}
