/**
 * Inject the read-access clause into the H3 branches of `cluster_events`.
 *
 * Migration 20260417_160000 added the `includePublic`/`ownerId` access clause
 * to the event SQL functions by string-searching the live definitions for the
 * marker `p_filters->'catalogIds' IS NULL OR`. The two H3 branches of
 * `cluster_events` (merge-overlapping and plain H3, defined in
 * 20260331_000000_unique_locations) spell that clause with a DOUBLE arrow —
 * `p_filters->>'catalogIds' IS NULL OR` — so the marker never matched them and
 * the access clause landed in only 6 of the function's 8 event scans (grid-k
 * x5 and dbscan got it; both H3 branches did not).
 *
 * Because `h3` is the DEFAULT clustering algorithm for `/api/v1/events/geo`,
 * the default map path aggregated over ALL events — including private datasets
 * and other users' catalogs — leaking per-cell counts, centroids, location
 * names, and (for single-event cells) private event IDs and titles.
 *
 * Approach: same in-place rewrite as 20260417_160000 (fetch live definitions
 * via `pg_get_functiondef`, inject after the enclosing parenthesized clause),
 * but keyed on the double-arrow marker. Idempotent: a scan whose clause is
 * already followed by the access clause is skipped. The injected text is
 * byte-identical to 20260417_160000's ACCESS_CLAUSE so the function bodies
 * stay uniform for any future marker-based patches.
 *
 * down() removes exactly the clauses this migration injected (those that
 * immediately follow a double-arrow catalogIds clause).
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal"];

// The double-arrow spelling used by the two H3 branches in 20260331. The
// single-arrow marker that 20260417_160000 searched for does not match this.
const H3_MARKER = "p_filters->>'catalogIds' IS NULL OR";

// Byte-identical to 20260417_160000's ACCESS_CLAUSE.
const ACCESS_CLAUSE = `
        AND (
          (COALESCE((p_filters->>'includePublic')::boolean, true) IS TRUE AND e.dataset_is_public = true)
          OR ((p_filters->>'ownerId') IS NOT NULL AND e.catalog_owner_id = (p_filters->>'ownerId')::int)
        )`;

/** Find the end index (exclusive) of the parenthesized clause containing `markerIndex`. */
const findClauseEnd = (definition: string, markerIndex: number): number => {
  const clauseStart = definition.lastIndexOf("(", markerIndex);
  if (clauseStart === -1) {
    return -1;
  }

  let depth = 0;
  for (let index = clauseStart; index < definition.length; index += 1) {
    const char = definition[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return -1;
};

const insertAccessClause = (definition: string): string => {
  let updated = definition;
  let searchIndex = 0;

  while (true) {
    const markerIndex = updated.indexOf(H3_MARKER, searchIndex);
    if (markerIndex === -1) {
      break;
    }

    const clauseEnd = findClauseEnd(updated, markerIndex);
    if (clauseEnd === -1) {
      break;
    }

    if (updated.startsWith(ACCESS_CLAUSE, clauseEnd)) {
      searchIndex = clauseEnd + ACCESS_CLAUSE.length;
      continue;
    }

    updated = `${updated.slice(0, clauseEnd)}${ACCESS_CLAUSE}${updated.slice(clauseEnd)}`;
    searchIndex = clauseEnd + ACCESS_CLAUSE.length;
  }

  return updated;
};

const removeAccessClause = (definition: string): string => {
  let updated = definition;
  let searchIndex = 0;

  while (true) {
    const markerIndex = updated.indexOf(H3_MARKER, searchIndex);
    if (markerIndex === -1) {
      break;
    }

    const clauseEnd = findClauseEnd(updated, markerIndex);
    if (clauseEnd === -1) {
      break;
    }

    if (updated.startsWith(ACCESS_CLAUSE, clauseEnd)) {
      updated = `${updated.slice(0, clauseEnd)}${updated.slice(clauseEnd + ACCESS_CLAUSE.length)}`;
    }
    searchIndex = clauseEnd;
  }

  return updated;
};

const rewriteFunctions = async (
  db: MigrateUpArgs["db"] | MigrateDownArgs["db"],
  transform: (definition: string) => string
) => {
  const result = (await db.execute(
    sql.raw(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = ANY(ARRAY['${FUNCTIONS.join("','")}'])
      AND n.nspname IN ('public', 'payload')
  `)
  )) as { rows: Array<{ definition: string }> };

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
