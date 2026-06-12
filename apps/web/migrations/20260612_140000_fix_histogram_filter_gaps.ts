/**
 * Close two filter gaps in `calculate_event_histogram`.
 *
 * 1. `clusterCells` / `h3Resolution`: the frontend sends the H3 cluster-focus
 *    filter to `/api/v1/events/temporal` (`toHistogramJsonb` serializes it),
 *    and `cluster_events_temporal` (beeswarm) plus the events list both apply
 *    it — but `calculate_event_histogram` never had a `clusterCells` clause,
 *    so the time histogram silently aggregated the whole viewport while the
 *    list/beeswarm showed only the focused cluster. Inject the SAME
 *    h3-column CASE block `cluster_events_temporal` uses, after every
 *    range-filter clause (all three event scans).
 *
 * 2. Single-timestamp branch bounds: when every filtered event shares one
 *    exact timestamp, the degenerate branch re-filters by catalog/datasets/
 *    field/range filters but dropped the `bounds` block — so the single
 *    returned bucket counted events globally instead of within the viewport.
 *    Insert the bounds block right after `WHERE e.event_timestamp = v_min_date`.
 *
 * Same in-place live-definition rewrite as 20260417_160000 / 20260612_130000.
 * Idempotent: functions already containing `clusterCells` (or the inserted
 * bounds block) are left untouched. down() is forward-only (mirrors
 * 20260602_000000) — use `make db-reset` to rebuild from scratch.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const RANGE_FILTER_MARKER = "p_filters->'rangeFilters' IS NULL OR NOT EXISTS";
const SINGLE_TIMESTAMP_MARKER = "WHERE e.event_timestamp = v_min_date";

// Byte-identical to the clusterCells block in cluster_events_temporal so the
// two functions stay uniform for future marker-based patches.
const CLUSTER_CELLS_BLOCK = `
          AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))`;

// Same antimeridian-aware bounds block the other two histogram scans carry.
const BOUNDS_BLOCK = `
          AND (p_filters->'bounds' IS NULL OR (
            CASE WHEN (p_filters->'bounds'->>'minLng')::double precision
                   <= (p_filters->'bounds'->>'maxLng')::double precision
              THEN e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision
                AND (p_filters->'bounds'->>'maxLng')::double precision
              ELSE (e.location_longitude >= (p_filters->'bounds'->>'minLng')::double precision
                 OR e.location_longitude <= (p_filters->'bounds'->>'maxLng')::double precision)
            END
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))`;

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

const insertClusterCells = (definition: string): string => {
  if (definition.includes("clusterCells")) {
    return definition;
  }

  let updated = definition;
  let searchIndex = 0;

  while (true) {
    const markerIndex = updated.indexOf(RANGE_FILTER_MARKER, searchIndex);
    if (markerIndex === -1) {
      break;
    }

    const clauseEnd = findClauseEnd(updated, markerIndex);
    if (clauseEnd === -1) {
      break;
    }

    updated = `${updated.slice(0, clauseEnd)}${CLUSTER_CELLS_BLOCK}${updated.slice(clauseEnd)}`;
    searchIndex = clauseEnd + CLUSTER_CELLS_BLOCK.length;
  }

  return updated;
};

const insertSingleTimestampBounds = (definition: string): string => {
  const markerIndex = definition.indexOf(SINGLE_TIMESTAMP_MARKER);
  if (markerIndex === -1) {
    return definition;
  }

  const insertAt = markerIndex + SINGLE_TIMESTAMP_MARKER.length;
  if (definition.startsWith(BOUNDS_BLOCK, insertAt)) {
    return definition;
  }

  return `${definition.slice(0, insertAt)}${BOUNDS_BLOCK}${definition.slice(insertAt)}`;
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const result = (await db.execute(
    sql.raw(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'calculate_event_histogram'
      AND n.nspname IN ('public', 'payload')
  `)
  )) as { rows: Array<{ definition: string }> };

  for (const row of result.rows) {
    const updatedDefinition = insertSingleTimestampBounds(insertClusterCells(row.definition));
    if (updatedDefinition === row.definition) {
      continue;
    }

    await db.execute(sql.raw(updatedDefinition));
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only: removing interleaved clauses by reverse string surgery
  // risks silent corruption. Rebuild from scratch (make db-reset) instead.
}
