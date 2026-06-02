/**
 * Project a dataset's persisted interpretation plan to per-field number formats.
 *
 * Range filters normalize stored raw text to a numeric value at QUERY time using
 * the column's resolved locale convention (see {@link NumberFormat}). That
 * convention is decided once per column at detection time and persisted on the
 * dataset's `interpretationPlan` (a Payload `type: "json"` field). This module
 * is a PURE foundation-layer reader: it narrows just the `columns` it needs and
 * projects the number-kind policy for the requested field paths, so the
 * infrastructure-layer query resolver can stay within its allowed dependencies
 * (it must not import the domain ingest modules).
 *
 * A field whose column has no number-kind policy is intentionally OMITTED — we
 * cannot safely `::numeric`-normalize without a known format, so such a field is
 * dropped upstream rather than guessed. Missing `decimalSeparator` defaults to
 * `"."` and missing `thousandsSeparator` to `null` (the US default that
 * `decideNumberFormat` returns for plain/ambiguous/native-number columns).
 *
 * @module
 * @category Filters
 */
import type { NumberFormat } from "@/lib/utils/number-parsing";

/** Minimal shape of one persisted column policy needed to derive a NumberFormat. */
interface PersistedNumberPolicy {
  kind?: unknown;
  decimalSeparator?: unknown;
  thousandsSeparator?: unknown;
}

/** Minimal shape of one persisted plan column needed to match a field's number policy. */
interface PersistedColumn {
  field?: unknown;
  kind?: unknown;
  policy?: PersistedNumberPolicy | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Read the `columns` array off a persisted interpretation plan, or an empty list. */
const readPlanColumns = (interpretationPlan: unknown): PersistedColumn[] => {
  if (!isRecord(interpretationPlan)) return [];
  const columns = interpretationPlan.columns;
  return Array.isArray(columns) ? (columns as PersistedColumn[]) : [];
};

/** Narrow a persisted column's separator value to the NumberFormat-allowed set. */
const decimalSeparatorOf = (policy: PersistedNumberPolicy): NumberFormat["decimalSeparator"] =>
  policy.decimalSeparator === "," ? "," : ".";

const thousandsSeparatorOf = (policy: PersistedNumberPolicy): NumberFormat["thousandsSeparator"] => {
  if (policy.thousandsSeparator === "." || policy.thousandsSeparator === ",") return policy.thousandsSeparator;
  return null;
};

/**
 * Project the requested field paths to their resolved {@link NumberFormat}.
 *
 * Only fields backed by a `kind: "number"` column with a `kind: "number"` policy
 * are included; all others are omitted (caller drops them from the range filter).
 */
export const projectNumberFormats = (
  interpretationPlan: unknown,
  fieldKeys: readonly string[]
): Record<string, NumberFormat> => {
  const columns = readPlanColumns(interpretationPlan);
  const result: Record<string, NumberFormat> = {};

  for (const key of fieldKeys) {
    const column = columns.find((c) => c.field === key && c.kind === "number");
    const policy = column?.policy;
    if (policy?.kind !== "number") continue;
    result[key] = { decimalSeparator: decimalSeparatorOf(policy), thousandsSeparator: thousandsSeparatorOf(policy) };
  }

  return result;
};
