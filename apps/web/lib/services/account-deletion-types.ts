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
  scheduledImports: number;
  importFiles: number;
  media: number;
}

/** Result of scheduling a deletion. */
export interface ScheduleDeletionResult {
  success: boolean;
  deletionScheduledAt: string;
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
    scheduledImports: number;
    importFiles: number;
  };
}

/** Check result for whether a user can be deleted. */
export interface CanDeleteResult {
  allowed: boolean;
  reason?: string;
}
