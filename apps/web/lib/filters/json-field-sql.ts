/**
 * Literal-key-first JSON access for `transformed_data`, in SQL.
 *
 * The SQL mirror of `getByPathOrKey`: an exact top-level key wins over dot-path
 * traversal, so a flattened header literally named `event.title` resolves the same
 * way in the database as it does in the row-level JavaScript of the ingest pipeline.
 *
 * @module
 * @category Filters
 */
import { sql } from "@payloadcms/db-postgres";

type SqlFragment = ReturnType<typeof sql>;

/**
 * Text at `key`, literal key first.
 *
 * `jsonb_exists` rather than `COALESCE(td ->> key, …)`: a literal key holding JSON
 * `null` exists but reads as SQL NULL, and COALESCE would fall through to the path
 * traversal there — `getByPathOrKey` stops at the own key and returns its null.
 * A NULL key yields NULL from `jsonb_exists`, so the ELSE branch keeps the old
 * behaviour for the callers that pass an unresolved role path.
 *
 * The key is parenthesised because it may itself be a JSON lookup: `->>` is
 * left-associative, so `td ->> d.plan->'roles'->>'title'` would parse as
 * `((td ->> d.plan) -> 'roles') ->> 'title'` and read the wrong document.
 */
export const jsonTextAtPathOrKey = (column: SqlFragment, key: SqlFragment): SqlFragment =>
  sql`(CASE WHEN jsonb_exists(${column}, (${key})) THEN ${column} ->> (${key}) ELSE ${column} #>> string_to_array((${key}), '.') END)`;

/** The jsonb value at `key`, literal key first — the `->` / `#>` pair of {@link jsonTextAtPathOrKey}. */
export const jsonValueAtPathOrKey = (column: SqlFragment, key: SqlFragment): SqlFragment =>
  sql`(CASE WHEN jsonb_exists(${column}, (${key})) THEN ${column} -> (${key}) ELSE ${column} #> string_to_array((${key}), '.') END)`;
