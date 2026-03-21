import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Deduplicate existing datasets: append " (2)", " (3)", etc. to duplicate names within the same catalog
  await db.execute(sql`
  UPDATE payload.datasets d
  SET name = d.name || ' (' || sub.rn || ')'
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY catalog_id, name ORDER BY id) AS rn
    FROM payload.datasets
  ) sub
  WHERE d.id = sub.id AND sub.rn > 1;

  CREATE UNIQUE INDEX "datasets_catalog_name_unique_idx"
    ON "payload"."datasets" USING btree ("catalog_id", "name");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "payload"."datasets_catalog_name_unique_idx";`)
}
