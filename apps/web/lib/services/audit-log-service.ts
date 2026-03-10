/**
 * Service for creating immutable audit log entries.
 *
 * Provides a single function to record sensitive account actions. PII (email,
 * IP address) is hashed automatically. Errors are caught and logged — audit
 * logging never blocks the primary action.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import { hashEmail, hashIpAddress } from "@/lib/utils/hash";

const logger = createLogger("audit-log-service");

/** Action type constants for type safety (not credentials). */

export const AUDIT_ACTIONS = {
  // Account actions
  EMAIL_CHANGED: "account.email_changed",
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- audit action type identifier
  PASSWORD_CHANGED: "account.password_changed",
  DELETION_SCHEDULED: "account.deletion_scheduled",
  DELETION_CANCELLED: "account.deletion_cancelled",
  DELETION_EXECUTED: "account.deletion_executed",
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- audit action type identifier
  PASSWORD_VERIFY_FAILED: "account.password_verify_failed",

  // Admin actions on users
  TRUST_LEVEL_CHANGED: "admin.trust_level_changed",
  ROLE_CHANGED: "admin.role_changed",
  USER_ACTIVATED: "admin.user_activated",
  USER_DEACTIVATED: "admin.user_deactivated",
  CUSTOM_QUOTAS_CHANGED: "admin.custom_quotas_changed",
  QUOTA_OVERRIDDEN: "admin.quota_overridden",

  // Data visibility
  CATALOG_VISIBILITY_CHANGED: "data.catalog_visibility_changed",
  DATASET_VISIBILITY_CHANGED: "data.dataset_visibility_changed",
  CATALOG_OWNERSHIP_TRANSFERRED: "data.catalog_ownership_transferred",
  DATASET_OWNERSHIP_TRANSFERRED: "data.dataset_ownership_transferred",

  // System configuration
  FEATURE_FLAG_CHANGED: "system.feature_flag_changed",
  SETTINGS_CHANGED: "system.settings_changed",

  // Import admin operations
  IMPORT_JOB_STAGE_OVERRIDE: "import.job_stage_override",
  SCHEDULED_IMPORT_ADMIN_MODIFIED: "import.scheduled_import_admin_modified",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditLogEntry {
  /** The action being recorded. */
  action: AuditAction;
  /** The user ID the action pertains to. */
  userId: number;
  /** The user's email (will be hashed before storage). */
  userEmail: string;
  /** Admin user ID who initiated the action (null for self-initiated). */
  performedBy?: number;
  /** Client IP address (stored raw for 30 days, then cleared; hash is permanent). */
  ipAddress?: string;
  /** Action-specific structured data. */
  details?: Record<string, unknown>;
}

/**
 * Create an immutable audit log entry. Hashes PII internally.
 *
 * This function catches all errors and logs them — it never throws.
 * Audit logging must not prevent the primary operation from completing.
 */
export const auditLog = async (payload: Payload, entry: AuditLogEntry): Promise<void> => {
  try {
    await payload.create({
      collection: "audit-log",
      data: {
        action: entry.action,
        userId: entry.userId,
        userEmailHash: hashEmail(entry.userEmail),
        performedBy: entry.performedBy ?? undefined,
        timestamp: new Date().toISOString(),
        ipAddress: entry.ipAddress ?? undefined,
        ipAddressHash: entry.ipAddress ? hashIpAddress(entry.ipAddress) : undefined,
        details: entry.details ?? undefined,
      },
      overrideAccess: true,
    });
  } catch (error) {
    logger.error({ error, action: entry.action, userId: entry.userId }, "Failed to create audit log entry");
  }
};

/** Configuration for detecting field changes and creating audit entries. */
export interface FieldAuditConfig {
  /** The audit action to record for this field change. */
  action: AuditAction;
  /** Dot-separated path to the field on the document. */
  fieldPath: string;
  /** Optional transform for the audit details. Receives (oldValue, newValue). */
  detailsFn?: (oldValue: unknown, newValue: unknown) => Record<string, unknown>;
}

/** Get a nested value from an object using a dot-separated path. */
const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

/** Simple deep equality check using JSON serialization. */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * Detect field-level changes between previousDoc and doc, and fire audit log
 * entries for each changed field. Designed for Payload afterChange hooks.
 */
export const auditFieldChanges = async (
  payload: Payload,
  args: {
    previousDoc: Record<string, unknown> | undefined;
    doc: Record<string, unknown>;
    userId: number;
    userEmail: string;
    performedBy?: number;
    ipAddress?: string;
  },
  fields: FieldAuditConfig[]
): Promise<void> => {
  if (!args.previousDoc) return;

  const promises: Promise<void>[] = [];

  for (const field of fields) {
    const oldValue = getNestedValue(args.previousDoc, field.fieldPath);
    const newValue = getNestedValue(args.doc, field.fieldPath);

    if (!deepEqual(oldValue, newValue)) {
      const details = field.detailsFn ? field.detailsFn(oldValue, newValue) : { previousValue: oldValue, newValue };

      promises.push(
        auditLog(payload, {
          action: field.action,
          userId: args.userId,
          userEmail: args.userEmail,
          performedBy: args.performedBy,
          ipAddress: args.ipAddress,
          details,
        })
      );
    }
  }

  await Promise.all(promises);
};
