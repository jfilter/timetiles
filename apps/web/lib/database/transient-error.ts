/**
 * Recognise database errors that a retry of the same operation can succeed on.
 *
 * Connection loss, serialization and deadlock aborts, statement timeouts and
 * server shutdowns are transient; constraint and data errors are not. Drivers
 * and ORMs wrap the pg error, so the `cause` chain is searched as well.
 *
 * @module
 * @category Database
 */

/** SQLSTATE codes and classes (two-character prefixes) that a retry can clear. */
const TRANSIENT_SQLSTATE_CLASSES = new Set(["08", "53"]);
const TRANSIENT_SQLSTATES = new Set(["40001", "40P01", "57014", "57P01", "57P02", "57P03"]);
const TRANSIENT_NODE_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH"]);
/** node-postgres raises these without a code. */
const TRANSIENT_MESSAGES = ["Connection terminated", "timeout exceeded when trying to connect"];

const MAX_CAUSE_DEPTH = 5;

const isTransientCode = (code: string): boolean =>
  TRANSIENT_SQLSTATES.has(code) ||
  TRANSIENT_NODE_CODES.has(code) ||
  (code.length === 5 && TRANSIENT_SQLSTATE_CLASSES.has(code.slice(0, 2)));

/** Returns true when `error`, or an error in its cause chain, is a transient database failure. */
export const isTransientDatabaseError = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === "object" && current !== null; depth++) {
    const { code, message, cause } = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof code === "string" && isTransientCode(code)) return true;
    if (typeof message === "string" && TRANSIENT_MESSAGES.some((m) => message.includes(m))) return true;
    current = cause;
  }
  return false;
};
