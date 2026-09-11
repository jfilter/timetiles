/**
 * Detect Postgres unique-constraint violations across the layers Payload can
 * wrap them in.
 *
 * A raw insert surfaces SQLSTATE `23505` on the error's `code`, but Payload's
 * REST/GraphQL flows re-wrap it as a ValidationError whose `data.errors[]`
 * entries read "Value must be unique", and some intermediate wrappings only
 * preserve the code or constraint name in the message string. Optimistic
 * find-then-create paths use this to recognise the lost-race case and recover
 * (re-read the winner's row) instead of failing.
 *
 * @module
 * @category Database
 */

/**
 * Returns true when `error` is a Postgres unique-constraint violation.
 *
 * Constraint names are additional message fallbacks when no structured code
 * is available, not a filter restricting which unique violations match.
 */
export const isUniqueViolation = (error: unknown, ...constraints: string[]): boolean => {
  if (!error) return false;

  // 1. A structured error code takes precedence over incidental message text.
  const code = (error as { code?: string } | null)?.code;
  if (typeof code === "string") return code === "23505";

  // 2. Payload ValidationError wrapping the pg error.
  const errors = (error as { data?: { errors?: Array<{ message?: string }> } } | null)?.data?.errors;
  if (errors?.some((e) => /must be unique/i.test(e.message ?? ""))) return true;

  // 3. Fallback string matching for any intermediate wrapping.
  const message = error instanceof Error ? error.message : "";
  if (message.includes("23505") || message.includes("duplicate key")) return true;
  return constraints.some((c) => c !== "" && message.includes(c));
};
