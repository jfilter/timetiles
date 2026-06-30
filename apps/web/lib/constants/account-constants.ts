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

/**
 * Days after which raw IP addresses in audit logs are anonymized by the
 * `audit-log-ip-cleanup` job. Single source of truth for both the job and the
 * privacy-policy copy so the two never drift.
 */
export const IP_RETENTION_DAYS = 30;

/**
 * Days a generated data-export download link stays valid. Single source of
 * truth for the data-export job's expiry math and the settings-card copy.
 */
export const EXPORT_EXPIRY_DAYS = 7;
