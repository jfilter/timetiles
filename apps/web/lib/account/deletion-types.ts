/**
 * Types for account deletion service.
 *
 * @module
 * @category Services
 */

/** Summary of data affected by account deletion. */
export interface DeletionSummary {
  catalogs: { public: number; private: number };
  datasets: { public: number; private: number };
  events: { inPublicDatasets: number; inPrivateDatasets: number };
  scheduledIngests: number;
  importFiles: number;
  media: number;
  views: number;
  dataExports: number;
  scraperRepos: number;
}

/** Result of scheduling a deletion. */
export interface ScheduleDeletionResult {
  success: boolean;
  deletionScheduledAt: string;
  /** Configured grace period (days) actually applied — for accurate messaging. */
  gracePeriodDays: number;
  summary: DeletionSummary;
}

/** Result of executing a deletion. */
export interface ExecuteDeletionResult {
  success: boolean;
  deletedUserId: number;
  transferredToUserId: number;
  dataTransferred: { catalogs: number; datasets: number };
  dataDeleted: {
    catalogs: number;
    datasets: number;
    events: number;
    scheduledIngests: number;
    importFiles: number;
    scraperRepos: number;
  };
}

/**
 * Stable, locale-independent reason a deletion is blocked.
 *
 * The client maps this to a translated message; `reason` stays English for
 * server logs and thrown errors. Without a code the UI would render the raw
 * English `reason` verbatim, leaking untranslated copy to non-English users.
 */
export type CannotDeleteReasonCode =
  | "userNotFound"
  | "systemUser"
  | "alreadyDeleted"
  | "lastAdmin"
  | "activeImportJobs";

/** Check result for whether a user can be deleted. */
export interface CanDeleteResult {
  allowed: boolean;
  reason?: string;
  /** Locale-independent code for the block, for client-side translation. */
  reasonCode?: CannotDeleteReasonCode;
}
