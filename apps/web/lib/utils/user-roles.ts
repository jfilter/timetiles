/**
 * Role predicates shared across every layer.
 *
 * These live in the foundation layer rather than next to the Payload access rules because
 * infrastructure code needs them too: the SQL event-query adapter has to reproduce the same
 * privilege decision the `events` collection's `read` rule makes, and `lib/services` may not
 * import from `lib/collections`.
 *
 * @module
 * @category Utilities
 */

/** Admin or editor — the roles Payload access rules treat as unrestricted readers. */
export const isPrivileged = (user?: { role?: string | null } | null): boolean =>
  user?.role === "admin" || user?.role === "editor";
