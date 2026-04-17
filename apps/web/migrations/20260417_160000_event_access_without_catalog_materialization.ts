/**
 * Stop materializing accessible catalog ID lists in event-query filters.
 *
 * The event SQL functions previously relied on `catalogIds` containing every
 * accessible public/owned catalog for the caller. At scale that turns every
 * request into a large ID-materialization step in application code.
 *
 * This migration updates the PostgreSQL functions to accept explicit read
 * access flags instead:
 * - `includePublic` enables `dataset_is_public = true`
 * - `ownerId` enables `catalog_owner_id = ownerId`
 *
 * The existing `catalogId` / `catalogIds` filters remain as optional query
 * narrowing (explicit catalog filter or scoped catalog subsets), but they no
 * longer need to carry the full accessible catalog universe.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal", "calculate_temporal_clusters"];
const ACCESS_CLAUSE = `
        AND (
          (COALESCE((p_filters->>'includePublic')::boolean, true) IS TRUE AND e.dataset_is_public = true)
          OR ((p_filters->>'ownerId') IS NOT NULL AND e.catalog_owner_id = (p_filters->>'ownerId')::int)
        )`;

const insertAccessClause = (definition: string): string => {
  if (definition.includes("includePublic")) {
    return definition;
  }

  let updated = definition;
  let searchIndex = 0;

  while (true) {
    const markerIndex = updated.indexOf("p_filters->'catalogIds' IS NULL OR", searchIndex);
    if (markerIndex === -1) {
      break;
    }

    const clauseStart = updated.lastIndexOf("(", markerIndex);
    if (clauseStart === -1) {
      break;
    }

    let depth = 0;
    let clauseEnd = -1;
    for (let index = clauseStart; index < updated.length; index += 1) {
      const char = updated[index];
      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          clauseEnd = index + 1;
          break;
        }
      }
    }

    if (clauseEnd === -1) {
      break;
    }

    updated = `${updated.slice(0, clauseEnd)}${ACCESS_CLAUSE}${updated.slice(clauseEnd)}`;
    searchIndex = clauseEnd + ACCESS_CLAUSE.length;
  }

  return updated;
};

const removeAccessClause = (definition: string): string => definition.split(ACCESS_CLAUSE).join("");

const rewriteFunctions = async (
  db: MigrateUpArgs["db"] | MigrateDownArgs["db"],
  transform: (definition: string) => string
) => {
  const result = (await db.execute(sql.raw(`
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = ANY(ARRAY['${FUNCTIONS.join("','")}'])
      AND n.nspname IN ('public', 'payload')
  `))) as {
    rows: Array<{ definition: string; oid: number; proname: string; schema_name: string }>;
  };

  for (const row of result.rows) {
    const updatedDefinition = transform(row.definition);
    if (updatedDefinition === row.definition) {
      continue;
    }

    await db.execute(sql.raw(updatedDefinition));
  }
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await rewriteFunctions(db, insertAccessClause);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await rewriteFunctions(db, removeAccessClause);
}
