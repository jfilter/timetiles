import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Add catalog_is_public column to datasets (other columns already added in previous migration)
  await db.execute(sql`
  ALTER TABLE "payload"."datasets" ADD COLUMN "catalog_is_public" boolean DEFAULT false;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_catalog_is_public" boolean DEFAULT false;
  CREATE INDEX "datasets_catalog_is_public_idx" ON "payload"."datasets" USING btree ("catalog_is_public");
  CREATE INDEX "_datasets_v_version_version_catalog_is_public_idx" ON "payload"."_datasets_v" USING btree ("version_catalog_is_public");`)

  // Populate catalog_is_public for datasets
  await db.execute(sql`
    UPDATE "payload"."datasets" d
    SET "catalog_is_public" = COALESCE(c."is_public", false)
    FROM "payload"."catalogs" c
    WHERE d."catalog_id" = c."id";`)

  // Fix datasetIsPublic: should be true only if BOTH dataset AND catalog are public
  // (Previous migration set it from dataset.isPublic only)
  await db.execute(sql`
    UPDATE "payload"."events" e
    SET "dataset_is_public" = COALESCE(d."is_public", false) AND COALESCE(c."is_public", false)
    FROM "payload"."datasets" d
    JOIN "payload"."catalogs" c ON d."catalog_id" = c."id"
    WHERE e."dataset_id" = d."id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Only drop catalog_is_public (other columns managed by previous migration)
  await db.execute(sql`
  DROP INDEX "payload"."datasets_catalog_is_public_idx";
  DROP INDEX "payload"."_datasets_v_version_version_catalog_is_public_idx";
  ALTER TABLE "payload"."datasets" DROP COLUMN "catalog_is_public";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_catalog_is_public";`)
}
