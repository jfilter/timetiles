/**
 * Shared helpers for working with Drizzle ORM.
 *
 * @module
 * @category Database
 */

/**
 * Cast a Drizzle table schema to a record for dynamic column access.
 *
 * Drizzle table schemas have typed column properties but don't support
 * runtime string indexing. This helper concentrates the type workaround.
 *
 * @see https://github.com/drizzle-team/drizzle-orm/issues/1510
 */
export const drizzleColumns = (table: unknown): Record<string, unknown> => table as Record<string, unknown>;
