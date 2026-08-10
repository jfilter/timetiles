/**
 * Data-export lifecycle statuses.
 *
 * @module
 * @category Services
 */

/** Full lifecycle, in order. Mirrors the `status` field options on the collection. */
export const DATA_EXPORT_STATUSES = ["pending", "processing", "ready", "failed", "expired"] as const;

export type DataExportStatus = (typeof DATA_EXPORT_STATUSES)[number];

/**
 * Statuses that mean an export is still in flight.
 *
 * Two independent decisions read this set — whether a second request is a
 * duplicate, and whether the cleanup job may reap a stale row — so a new status
 * must answer both questions in one place instead of drifting between them.
 */
export const ACTIVE_DATA_EXPORT_STATUSES = ["pending", "processing"] as const satisfies readonly DataExportStatus[];
