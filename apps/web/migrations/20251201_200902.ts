import type { MigrateUpArgs, MigrateDownArgs} from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_datasets_import_transforms_input_format" AS ENUM('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY');
  CREATE TYPE "payload"."enum_datasets_import_transforms_output_format" AS ENUM('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY');
  CREATE TYPE "payload"."enum_datasets_import_transforms_operation" AS ENUM('uppercase', 'lowercase', 'trim', 'replace');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_input_format" AS ENUM('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_output_format" AS ENUM('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY');
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_operation" AS ENUM('uppercase', 'lowercase', 'trim', 'replace');
  ALTER TYPE "payload"."enum_datasets_import_transforms_type" ADD VALUE 'date-parse';
  ALTER TYPE "payload"."enum_datasets_import_transforms_type" ADD VALUE 'string-op';
  ALTER TYPE "payload"."enum_datasets_import_transforms_type" ADD VALUE 'concatenate';
  ALTER TYPE "payload"."enum_datasets_import_transforms_type" ADD VALUE 'split';
  ALTER TYPE "payload"."enum__datasets_v_version_import_transforms_type" ADD VALUE 'date-parse';
  ALTER TYPE "payload"."enum__datasets_v_version_import_transforms_type" ADD VALUE 'string-op';
  ALTER TYPE "payload"."enum__datasets_v_version_import_transforms_type" ADD VALUE 'concatenate';
  ALTER TYPE "payload"."enum__datasets_v_version_import_transforms_type" ADD VALUE 'split';
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "input_format" "payload"."enum_datasets_import_transforms_input_format";
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "output_format" "payload"."enum_datasets_import_transforms_output_format" DEFAULT 'YYYY-MM-DD';
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "timezone" varchar;
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "operation" "payload"."enum_datasets_import_transforms_operation";
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "pattern" varchar;
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "replacement" varchar;
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "from_fields" jsonb;
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "separator" varchar DEFAULT ' ';
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "delimiter" varchar DEFAULT ',';
  ALTER TABLE "payload"."datasets_import_transforms" ADD COLUMN "to_fields" jsonb;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "input_format" "payload"."enum__datasets_v_version_import_transforms_input_format";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "output_format" "payload"."enum__datasets_v_version_import_transforms_output_format" DEFAULT 'YYYY-MM-DD';
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "timezone" varchar;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "operation" "payload"."enum__datasets_v_version_import_transforms_operation";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "pattern" varchar;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "replacement" varchar;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "from_fields" jsonb;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "separator" varchar DEFAULT ' ';
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "delimiter" varchar DEFAULT ',';
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ADD COLUMN "to_fields" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum_datasets_import_transforms_type";
  CREATE TYPE "payload"."enum_datasets_import_transforms_type" AS ENUM('rename');
  ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum_datasets_import_transforms_type";
  ALTER TABLE "payload"."datasets_import_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum_datasets_import_transforms_type" USING "type"::"payload"."enum_datasets_import_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_type";
  CREATE TYPE "payload"."enum__datasets_v_version_import_transforms_type" AS ENUM('rename');
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum__datasets_v_version_import_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum__datasets_v_version_import_transforms_type" USING "type"::"payload"."enum__datasets_v_version_import_transforms_type";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "input_format";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "output_format";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "timezone";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "operation";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "pattern";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "replacement";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "from_fields";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "separator";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "delimiter";
  ALTER TABLE "payload"."datasets_import_transforms" DROP COLUMN "to_fields";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "input_format";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "output_format";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "timezone";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "operation";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "pattern";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "replacement";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "from_fields";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "separator";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "delimiter";
  ALTER TABLE "payload"."_datasets_v_version_import_transforms" DROP COLUMN "to_fields";
  DROP TYPE "payload"."enum_datasets_import_transforms_input_format";
  DROP TYPE "payload"."enum_datasets_import_transforms_output_format";
  DROP TYPE "payload"."enum_datasets_import_transforms_operation";
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_input_format";
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_output_format";
  DROP TYPE "payload"."enum__datasets_v_version_import_transforms_operation";`)
}
