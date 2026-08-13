/**
 * Resolve field keys literal-key-first inside the PL/pgSQL read paths.
 *
 * `getByPathOrKey` reads an exact top-level key before traversing, so a flattened header
 * literally named `event.title` survives ingest. Every SQL reader traversed unconditionally,
 * so such a field filtered, sorted and grouped as if it were missing. The TypeScript builders
 * now go through `jsonTextAtPathOrKey`; these three functions carry 73 copies of the same
 * expression and have to follow, or the map and the list disagree again.
 *
 * In-place live-definition rewrite, same mechanism as 20260813_180000: every access has the
 * shape `e.transformed_data #>>? string_to_array(<key>, '.')`, which becomes a CASE that
 * prefers the literal key. Idempotent via the marker. down() is forward-only; use
 * `make db-reset` to rebuild.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FUNCTIONS = ["cluster_events", "cluster_events_temporal", "calculate_event_histogram"];

const MARKER = "jsonb_exists(e.transformed_data";

/**
 * `e.transformed_data #> …` / `#>> …` over a key expression.
 *
 * The key is either a column (`ff.field_key`), a parameter (`p_group_by`) or the title role
 * lookup (`d.interpretation_plan->'roles'->>'title'`) — none of them contain a parenthesis,
 * so stopping the capture at the closing paren of `string_to_array` is unambiguous.
 */
const FIELD_ACCESS = /e\.transformed_data (#>>?) string_to_array\(([^)]+), '\.'\)/g;

const patchDefinition = (definition: string): string =>
  definition.includes(MARKER)
    ? definition
    : definition.replaceAll(FIELD_ACCESS, (_match, operator: string, key: string) => {
        // `#>>` yields text, `#>` yields jsonb; the literal-key branch needs the matching arity.
        const literalOperator = operator === "#>>" ? "->>" : "->";
        // The key is parenthesised: the title role is itself a `->`/`->>` chain, and those are
        // left-associative, so an unparenthesised key would re-bind the surrounding expression.
        return (
          `(CASE WHEN jsonb_exists(e.transformed_data, (${key})) ` +
          `THEN e.transformed_data ${literalOperator} (${key}) ` +
          `ELSE e.transformed_data ${operator} string_to_array((${key}), '.') END)`
        );
      });

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const name of FUNCTIONS) {
    const result = (await db.execute(
      sql.raw(`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = '${name}'
        AND n.nspname IN ('public', 'payload')
    `)
    )) as { rows: Array<{ definition: string }> };

    for (const row of result.rows) {
      const updated = patchDefinition(row.definition);
      if (updated === row.definition) {
        continue;
      }
      await db.execute(sql.raw(updated));
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only: reversing string surgery on a live definition risks silent corruption.
  // Rebuild from scratch (make db-reset) instead.
}
