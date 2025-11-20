/**
 * Audit logging service for tracking security-relevant events.
 *
 * Provides comprehensive logging of security events including authentication
 * failures, authorization denials, privilege changes, and suspicious activity.
 * All events are logged internally with context for forensic analysis.
 *
 * This service complements the standard application logger by focusing specifically
 * on security-relevant events that may need to be reviewed during incident response,
 * compliance audits, or security investigations.
 *
 * @module
 * @category Services
 */

import type { User } from "@/payload-types";

import { logger } from "../logger";

/**
 * Types of security events to track
 */
export type SecurityEventType =
  | "auth_failure" // Failed authentication attempt
  | "auth_success" // Successful authentication
  | "access_denied" // Authorization failure (user authenticated but lacks permission)
  | "privilege_change" // User role or permissions modified
  | "suspicious_activity" // Anomalous behavior detected
  | "data_access" // Access to sensitive data
  | "data_modification" // Modification of critical data
  | "rate_limit_exceeded" // Rate limit violation
  | "quota_exceeded" // Quota limit exceeded
  | "token_enumeration" // Potential token enumeration attempt
  | "mass_access_attempt" // Multiple rapid access attempts
  | "privilege_escalation_attempt" // Attempted privilege escalation
  | "configuration_change"; // System configuration modified

/**
 * Severity level for security events
 */
export type SecurityEventSeverity = "info" | "warning" | "error" | "critical";

/**
 * Security event data structure
 */
export interface SecurityEvent {
  /** Type of security event */
  type: SecurityEventType;
  /** User ID (if authenticated) */
  userId?: string | number;
  /** User email (if authenticated) */
  userEmail?: string;
  /** User role (if authenticated) */
  userRole?: string | null;
  /** Resource being accessed (collection name, API endpoint, etc.) */
  resource?: string;
  /** Action attempted (read, update, delete, etc.) */
  action?: string;
  /** IP address of the request */
  ipAddress?: string;
  /** User agent string */
  userAgent?: string;
  /** Additional context-specific metadata */
  metadata?: Record<string, unknown>;
  /** Human-readable message describing the event */
  message?: string;
  /** Timestamp when the event occurred */
  timestamp?: Date;
}

/**
 * Get severity level for a security event type
 */
const getSeverity = (eventType: SecurityEventType): SecurityEventSeverity => {
  const severityMap: Record<SecurityEventType, SecurityEventSeverity> = {
    auth_failure: "warning",
    auth_success: "info",
    access_denied: "warning",
    privilege_change: "critical",
    suspicious_activity: "error",
    data_access: "info",
    data_modification: "warning",
    rate_limit_exceeded: "warning",
    quota_exceeded: "info",
    token_enumeration: "error",
    mass_access_attempt: "error",
    privilege_escalation_attempt: "critical",
    configuration_change: "warning",
  };

  return severityMap[eventType] ?? "info";
};

/**
 * Log a security event.
 *
 * Events are logged to the application logger with appropriate severity.
 * In production, events can optionally be persisted to a database for
 * long-term forensic analysis.
 *
 * @param event - Security event to log
 *
 * @example
 * ```typescript
 * await logSecurityEvent({
 *   type: 'access_denied',
 *   userId: user?.id,
 *   resource: 'catalogs',
 *   action: 'update',
 *   ipAddress: getClientIP(request),
 *   message: 'User attempted to update catalog they do not own',
 * });
 * ```
 */
export const logSecurityEvent = (event: SecurityEvent): void => {
  const severity = getSeverity(event.type);
  const timestamp = event.timestamp ?? new Date();

  // Prepare log entry with consistent format
  const logEntry = {
    eventType: event.type,
    severity,
    userId: event.userId,
    userEmail: event.userEmail,
    userRole: event.userRole,
    resource: event.resource,
    action: event.action,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    timestamp: timestamp.toISOString(),
    message: event.message,
    metadata: event.metadata,
  };

  // Log to application logger based on severity
  switch (severity) {
    case "critical":
      logger.error(logEntry, `[SECURITY] ${event.type}: ${event.message ?? ""}`);
      break;
    case "error":
      logger.error(logEntry, `[SECURITY] ${event.type}: ${event.message ?? ""}`);
      break;
    case "warning":
      logger.warn(logEntry, `[SECURITY] ${event.type}: ${event.message ?? ""}`);
      break;
    case "info":
    default:
      logger.info(logEntry, `[SECURITY] ${event.type}: ${event.message ?? ""}`);
      break;
  }
};

/**
 * Log authentication failure event
 */
export const logAuthFailure = (params: {
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}): void => {
  logSecurityEvent({
    type: "auth_failure",
    userEmail: params.email,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    message: `Authentication failed: ${params.reason ?? "Invalid credentials"}`,
    metadata: { reason: params.reason },
  });
};

/**
 * Log authentication success event
 */
export const logAuthSuccess = (params: {
  userId: string;
  email: string;
  role?: string;
  ipAddress?: string;
  userAgent?: string;
}): void => {
  logSecurityEvent({
    type: "auth_success",
    userId: params.userId,
    userEmail: params.email,
    userRole: params.role,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    message: "User authenticated successfully",
  });
};

/**
 * Log access denial event
 */
export const logAccessDenied = (params: {
  user?: User | null;
  resource: string;
  action: string;
  ipAddress?: string;
  reason?: string;
}): void => {
  logSecurityEvent({
    type: "access_denied",
    userId: params.user?.id ? String(params.user.id) : undefined,
    userEmail: params.user?.email,
    userRole: params.user?.role,
    resource: params.resource,
    action: params.action,
    ipAddress: params.ipAddress,
    message: `Access denied to ${params.resource}.${params.action}: ${params.reason ?? "Insufficient permissions"}`,
    metadata: { reason: params.reason },
  });
};

/**
 * Log privilege change event
 */
export const logPrivilegeChange = (params: {
  targetUserId: string;
  targetUserEmail?: string;
  changedBy?: User | null;
  oldRole: string;
  newRole: string;
  ipAddress?: string;
}): void => {
  logSecurityEvent({
    type: "privilege_change",
    userId: params.changedBy?.id ? String(params.changedBy.id) : undefined,
    userEmail: params.changedBy?.email,
    userRole: params.changedBy?.role,
    ipAddress: params.ipAddress,
    message: `User role changed from ${params.oldRole} to ${params.newRole} for user ${params.targetUserEmail}`,
    metadata: {
      targetUserId: params.targetUserId,
      targetUserEmail: params.targetUserEmail,
      oldRole: params.oldRole,
      newRole: params.newRole,
    },
  });
};

/**
 * Log suspicious activity event
 */
export const logSuspiciousActivity = (params: {
  user?: User | null;
  activityType: string;
  description: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}): void => {
  logSecurityEvent({
    type: "suspicious_activity",
    userId: params.user?.id ? String(params.user.id) : undefined,
    userEmail: params.user?.email,
    userRole: params.user?.role,
    ipAddress: params.ipAddress,
    message: `Suspicious activity detected: ${params.activityType} - ${params.description}`,
    metadata: {
      activityType: params.activityType,
      ...params.metadata,
    },
  });
};

/**
 * Log rate limit exceeded event
 */
export const logRateLimitExceeded = (params: {
  identifier: string;
  resource: string;
  limit: number;
  ipAddress?: string;
}): void => {
  logSecurityEvent({
    type: "rate_limit_exceeded",
    resource: params.resource,
    ipAddress: params.ipAddress,
    message: `Rate limit exceeded for ${params.resource} (limit: ${params.limit})`,
    metadata: {
      identifier: params.identifier,
      limit: params.limit,
    },
  });
};

/**
 * Log quota exceeded event
 */
export const logQuotaExceeded = (params: { user: User; quotaType: string; limit: number; current: number }): void => {
  logSecurityEvent({
    type: "quota_exceeded",
    userId: String(params.user.id),
    userEmail: params.user.email,
    userRole: params.user.role,
    message: `Quota exceeded: ${params.quotaType} (${params.current}/${params.limit})`,
    metadata: {
      quotaType: params.quotaType,
      limit: params.limit,
      current: params.current,
    },
  });
};

/**
 * Log token enumeration attempt
 */
export const logTokenEnumeration = (params: {
  tokenType: string;
  resource: string;
  ipAddress?: string;
  attemptCount?: number;
}): void => {
  logSecurityEvent({
    type: "token_enumeration",
    resource: params.resource,
    ipAddress: params.ipAddress,
    message: `Potential token enumeration detected for ${params.tokenType} on ${params.resource}`,
    metadata: {
      tokenType: params.tokenType,
      attemptCount: params.attemptCount,
    },
  });
};

/**
 * Log privilege escalation attempt
 */
export const logPrivilegeEscalationAttempt = (params: {
  user: User;
  attemptedRole: string;
  ipAddress?: string;
  method?: string;
}): void => {
  logSecurityEvent({
    type: "privilege_escalation_attempt",
    userId: String(params.user.id),
    userEmail: params.user.email,
    userRole: params.user.role,
    ipAddress: params.ipAddress,
    message: `User attempted to escalate privileges to ${params.attemptedRole}`,
    metadata: {
      currentRole: params.user.role,
      attemptedRole: params.attemptedRole,
      method: params.method,
    },
  });
};

/**
 * Log configuration change event
 */
export const logConfigurationChange = (params: {
  user: User;
  component: string;
  action: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}): void => {
  logSecurityEvent({
    type: "configuration_change",
    userId: String(params.user.id),
    userEmail: params.user.email,
    userRole: params.user.role,
    resource: params.component,
    action: params.action,
    ipAddress: params.ipAddress,
    message: `Configuration changed: ${params.component}.${params.action}`,
    metadata: params.metadata,
  });
};

/**
 * Helper to extract IP address and user agent from Next.js request
 */
export const getRequestContext = (
  request: Request
): {
  ipAddress: string;
  userAgent: string;
} => {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  const ipAddress = forwarded?.split(",")[0]?.trim() ?? realIp ?? "unknown";

  return { ipAddress, userAgent };
};
