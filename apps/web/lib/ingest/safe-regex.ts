/**
 * Safety helpers for compiling user-supplied regex patterns used by the
 * `extract` ingest transform.
 *
 * User-controlled regex runs in-process inside the shared `ingest` queue
 * worker. A pathological pattern (classic catastrophic-backtracking shapes
 * like `(a+)+$`) can stall the worker and deny service to other imports.
 * JavaScript regex cannot be interrupted mid-match, so the realistic defence
 * is a strict structural validator that rejects patterns likely to backtrack
 * catastrophically **before** we call `new RegExp(...)`.
 *
 * The validator is intentionally conservative:
 * - A length cap keeps the grammar simple and cheap to analyse.
 * - Nested-quantifier shapes (`(…+)+`, `(…*)+`, etc.) are rejected outright.
 * - Other unambiguous ReDoS triggers (e.g. quantified alternations that
 *   overlap on the same input) are rejected when they are easy to detect
 *   lexically.
 *
 * False positives are acceptable here — users can rewrite legitimate patterns
 * to a safe shape. False negatives are what we are trying to avoid.
 *
 * @module
 * @category Ingest
 */

/** Hard cap on user-supplied regex pattern length. */
export const MAX_REGEX_PATTERN_LENGTH = 1000;

/**
 * Detect a nested quantifier on the same capture group.
 *
 * Matches shapes like:
 *   (a+)+        (a+)*
 *   (a*)+        (a*)*
 *   (a{1,3})+    (a{2,})*
 *   (?:a+)+      (?:a+)*
 *
 * The inner body may contain any characters except an unescaped `)`; the
 * outer quantifier must immediately follow the closing paren.
 *
 * Runs against patterns already length-capped to MAX_REGEX_PATTERN_LENGTH
 * (1000), so worst-case work is bounded.
 */
// eslint-disable-next-line sonarjs/slow-regex -- Detector regex; input bounded by MAX_REGEX_PATTERN_LENGTH
const NESTED_QUANTIFIER_RE = /\((?:\?:)?[^)]*?(?:[+*]|\{\d+,\d*\})\)[+*?]/;

/**
 * Detect an alternation whose branches both contain `+`/`*` on an overlapping
 * character class, sitting inside a quantified group: e.g. `(a+|a*)+`.
 *
 * This is a two-pass heuristic — first find a quantified group, then check
 * its interior for a `|` flanked on both sides by `+` or `*`. Splitting
 * the check avoids the super-linear backtracking the combined form has.
 */
// Both regexes scan inputs already capped at MAX_REGEX_PATTERN_LENGTH, so
// their worst-case work is bounded. The linter can't reason about the cap.
// eslint-disable-next-line sonarjs/slow-regex -- Detector regex; input bounded by MAX_REGEX_PATTERN_LENGTH
const QUANTIFIED_GROUP_RE = /\((?:\?:)?([^)]*)\)[+*?]/g;
// eslint-disable-next-line sonarjs/slow-regex -- Detector regex; input bounded by MAX_REGEX_PATTERN_LENGTH
const QUANTIFIED_ALT_INTERIOR_RE = /[+*][^|]*\|[^|]*[+*]/;

const hasAmbiguousAlternation = (pattern: string): boolean => {
  QUANTIFIED_GROUP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = QUANTIFIED_GROUP_RE.exec(pattern)) !== null) {
    const inner = match[1] ?? "";
    if (QUANTIFIED_ALT_INTERIOR_RE.test(inner)) return true;
  }
  return false;
};

/**
 * Validate a user-supplied regex pattern against known catastrophic-backtracking
 * shapes.
 *
 * Returns `{ valid: true }` or `{ valid: false, reason }`. The reason is a
 * user-presentable string suitable for storing on `job.errors`.
 *
 * This validator runs **before** `new RegExp(...)` so malformed-but-compilable
 * patterns are rejected early and never reach the matcher.
 */
export const validateExtractPattern = (pattern: string): { valid: true } | { valid: false; reason: string } => {
  if (typeof pattern !== "string") {
    return { valid: false, reason: "pattern must be a string" };
  }
  if (pattern.length === 0) {
    return { valid: false, reason: "pattern is empty" };
  }
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return { valid: false, reason: `pattern exceeds maximum length of ${MAX_REGEX_PATTERN_LENGTH} characters` };
  }

  if (NESTED_QUANTIFIER_RE.test(pattern)) {
    return {
      valid: false,
      reason: "pattern contains nested quantifiers (e.g. (a+)+) which risk catastrophic backtracking",
    };
  }

  if (hasAmbiguousAlternation(pattern)) {
    return { valid: false, reason: "pattern contains quantified alternations that risk catastrophic backtracking" };
  }

  // Final gate: confirm the pattern compiles. Invalid syntax is treated as
  // invalid here rather than propagating a raw SyntaxError.
  try {
    new RegExp(pattern);
  } catch (error) {
    return {
      valid: false,
      reason: `pattern is not valid regex: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return { valid: true };
};

/**
 * Compile and execute a user-supplied extract pattern safely.
 *
 * Pre-validates the pattern structure before calling the engine. Returns
 * `null` when the pattern is unsafe / invalid or when no match is found.
 * Exceptions from `RegExp.exec` (rare, but possible under exotic flag combos)
 * are swallowed — the caller should treat `null` as "no match".
 */
export const safeExtractMatch = (pattern: string, value: string): RegExpExecArray | null => {
  const validation = validateExtractPattern(pattern);
  if (!validation.valid) return null;

  try {
    return new RegExp(pattern).exec(value);
  } catch {
    return null;
  }
};
