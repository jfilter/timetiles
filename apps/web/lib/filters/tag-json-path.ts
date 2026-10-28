/**
 * GIN-indexable pre-filter for tag field filters in the PL/pgSQL event functions.
 *
 * `cluster_events`, `cluster_events_temporal` and `calculate_event_histogram` evaluate field
 * filters per row, which no index can serve. They also accept `tagPath`, a jsonpath matched
 * with `transformed_data @@ tagPath` ahead of that exact clause. The path only has to match a
 * superset of the rows the exact clause keeps, so lax-mode matches on extra shapes are fine.
 *
 * @module
 * @category Filters
 */
import { isValidFieldKey } from "./field-validation";

/** `#>` indexes into arrays on a numeric segment, which containment and key paths cannot express. */
export const hasArrayIndexSegment = (fieldKey: string): boolean => fieldKey.split(".").some((s) => /^-?\d+$/.test(s));

const keyPath = (segments: string[]): string => `$.${segments.map((s) => JSON.stringify(s)).join(".")}`;

/** One field's alternatives: any value, under the literal key or the nested path. */
const fieldClause = (fieldKey: string, values: string[]): string => {
  const paths = [keyPath([fieldKey])];
  if (fieldKey.includes(".")) paths.push(keyPath(fieldKey.split(".")));
  const terms = values.flatMap((value) => paths.map((path) => `${path}[*] == ${JSON.stringify(value)}`));
  return `(${terms.join(" || ")})`;
};

/**
 * The jsonpath for all tag filters, or undefined when none can be expressed.
 *
 * Fields with a numeric path segment are left out: the pre-filter may only narrow less.
 */
export const buildTagJsonPath = (
  fieldFilters: Record<string, string[]> | undefined,
  tagFields: Set<string> | undefined
): string | undefined => {
  if (!fieldFilters || !tagFields?.size) return undefined;

  const clauses = Object.entries(fieldFilters)
    .filter(
      ([fieldKey, values]) =>
        tagFields.has(fieldKey) &&
        Array.isArray(values) &&
        values.length > 0 &&
        isValidFieldKey(fieldKey) &&
        !hasArrayIndexSegment(fieldKey)
    )
    .map(([fieldKey, values]) => fieldClause(fieldKey, values));

  return clauses.length > 0 ? clauses.join(" && ") : undefined;
};
