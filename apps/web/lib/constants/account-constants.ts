/**
 * Account lifecycle constants.
 *
 * Client-safe constants for account management features (deletion, etc.).
 * This file is imported by client components — do NOT import server-only
 * modules (node:fs, getAppConfig, etc.) here.
 *
 * The server-side deletion job reads the configurable value from
 * `getAppConfig().account.deletionGracePeriodDays` directly.
 *
 * @module
 * @category Constants
 */

/** Grace period in days before account is permanently deleted (display default). */
export const DELETION_GRACE_PERIOD_DAYS = 30;
