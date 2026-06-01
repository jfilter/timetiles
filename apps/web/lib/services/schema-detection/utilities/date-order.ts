/**
 * Per-column day/month order detection for date columns (ADR 0040, Phase 2).
 *
 * Mirrors the combined-coordinate axis-order detector (`checkCommaFormat` in
 * `coordinates.ts`): scan a column's samples once and decide the order for the
 * WHOLE column, rather than guessing per row (the silent bug — `13/02/2024`
 * forces DD/MM but `01/02/2024` in the same column would otherwise parse MM/DD).
 *
 * A separated date `a<sep>b<sep>c` (sep ∈ / - .) disambiguates when one of the
 * first two parts exceeds 12: `first>12` ⇒ day-first (`D/M`), `second>12` ⇒
 * month-first (`M/D`). ISO `YYYY-...` (4-digit first part) is unambiguous and
 * skipped here — it is handled by the ISO parse path. When every sample fits both
 * orders (all parts ≤12) the column is genuinely `"ambiguous"`.
 *
 * @module
 * @category Services
 */

/** Minimum disambiguating-or-fitting samples before declaring a column ambiguous. */
const MIN_SAMPLES_FOR_ORDER_DECISION = 3;
const SEPARATORS = ["/", "-", "."] as const;

type OrderCounts = { matches: number; dMyOnly: number; mDyOnly: number };

/**
 * Parse a sample into its leading two date components, or null if it is not a
 * non-ISO separated date with three numeric parts.
 */
const parseDateComponents = (sample: unknown): { first: number; second: number } | null => {
  if (typeof sample !== "string") return null;
  const trimmed = sample.trim();
  const separator = SEPARATORS.find((s) => trimmed.includes(s));
  if (!separator) return null;

  const parts = trimmed.split(separator);
  // Three parts, and not ISO `YYYY-...` (4-digit leading year is unambiguous).
  if (parts.length !== 3 || parts[0]?.trim().length === 4) return null;

  const first = Number.parseInt(parts[0]?.trim() ?? "", 10);
  const second = Number.parseInt(parts[1]?.trim() ?? "", 10);
  const third = Number.parseInt(parts[2]?.trim() ?? "", 10);
  if (Number.isNaN(first) || Number.isNaN(second) || Number.isNaN(third)) return null;
  return { first, second };
};

const tallyDateSample = (sample: unknown, counts: OrderCounts): void => {
  const parsed = parseDateComponents(sample);
  if (!parsed) return;
  const { first, second } = parsed;

  // Both candidate parts must be plausible 1-31 components to count as a date.
  const looksDMy = first >= 1 && first <= 31 && second >= 1 && second <= 12;
  const looksMDy = first >= 1 && first <= 12 && second >= 1 && second <= 31;
  if (!looksDMy && !looksMDy) return;

  counts.matches++;
  if (looksDMy && !looksMDy) counts.dMyOnly++;
  else if (looksMDy && !looksDMy) counts.mDyOnly++;
};

/**
 * Decide a date column's day/month order from its samples.
 *
 * Returns `null` when there is too little date-shaped evidence to decide (the
 * caller leaves the column untyped / falls back to the legacy parser). Otherwise
 * `"D/M"`, `"M/D"`, or `"ambiguous"` (every sample fits both orders).
 */
export const checkDateOrder = (
  samples: readonly unknown[]
): { order: "D/M" | "M/D" | "ambiguous"; confidence: number } | null => {
  const counts: OrderCounts = { matches: 0, dMyOnly: 0, mDyOnly: 0 };
  for (const sample of samples) tallyDateSample(sample, counts);

  const { matches, dMyOnly, mDyOnly } = counts;
  if (matches === 0) return null;

  const confidence = matches / samples.length;
  if (confidence < 0.7) return null;

  // A single unambiguous sample decides the column (consistent with the
  // coordinate detector). Conflicting evidence (both seen) → ambiguous.
  if (dMyOnly > 0 && mDyOnly === 0) return { order: "D/M", confidence };
  if (mDyOnly > 0 && dMyOnly === 0) return { order: "M/D", confidence };

  if (matches < MIN_SAMPLES_FOR_ORDER_DECISION) return null;
  return { order: "ambiguous", confidence: Math.min(confidence, 0.4) };
};
