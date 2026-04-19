/**
 * Lifecycle hooks for the Users collection.
 *
 * @module
 */
import type {
  CollectionAfterChangeHook,
  CollectionAfterErrorHook,
  CollectionAfterLoginHook,
  CollectionBeforeChangeHook,
  PayloadRequest,
} from "payload";
import { AuthenticationError } from "payload";

import { DEFAULT_QUOTAS, normalizeTrustLevel, TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { validatePassword } from "@/lib/security/password-policy";
import { AUDIT_ACTIONS, auditFieldChanges, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";
import { AppError } from "@/lib/types/errors";

/** Read the client IP from a PayloadRequest, falling back to "unknown". */
export const getReqIp = (req: Pick<PayloadRequest, "headers">): string | undefined => {
  if (!req.headers) return undefined;
  const ip = getClientIdentifier(req as unknown as Request);
  return ip === "unknown" ? undefined : ip;
};

export const filterDefinedQuotas = (quotas: Record<string, unknown> | undefined): Record<string, number> => {
  const filtered: Record<string, number> = {};
  if (!quotas) return filtered;
  for (const key in quotas) {
    if (quotas[key] !== undefined) {
      filtered[key] = quotas[key] as number;
    }
  }
  return filtered;
};

export const initializeQuotasFromTrustLevel = (
  data: Record<string, unknown>,
  trustLevel: string | number | null | undefined
): void => {
  const normalized = normalizeTrustLevel(trustLevel);
  const defaultQuotas = DEFAULT_QUOTAS[normalized];
  const filteredProvidedQuotas = filterDefinedQuotas(data.quotas as Record<string, unknown> | undefined);
  data.quotas = { ...defaultQuotas, ...filteredProvidedQuotas };
};

export const usersBeforeChangeHook: CollectionBeforeChangeHook[] = [
  async ({ data, req }) => {
    // Centralized password policy (ADR 0039): only enforce when the
    // caller actually supplies a plaintext password via the public REST
    // API. Local API calls (seeds, tests, system operations) are
    // intentionally exempt so fixture passwords don't need to meet the
    // real-world 12-char + HIBP bar.
    if (req.payloadAPI !== "REST") return data;
    const pw = typeof data.password === "string" ? data.password : undefined;
    if (!pw) return data;
    const result = await validatePassword(pw);
    if (!result.ok) {
      throw new AppError(400, result.message, `password-${result.code}`);
    }
    return data;
  },
  ({ data, operation, req, originalDoc }) => {
    // SECURITY: Handle self-registration (unauthenticated user creation)
    // Force safe defaults to prevent privilege escalation
    //
    // We check req.payloadAPI === "REST" to distinguish between:
    // - Public API requests (REST): Users self-registering via HTTP endpoints
    // - Local API calls (payload.create()): Tests, seeding scripts, system operations
    //
    // Only public API self-registration should be restricted. Local API calls
    // (which have req.payloadAPI === "local" or undefined) need to create
    // admin users for testing and seeding purposes.
    const isPublicApiRequest = req.payloadAPI === "REST";
    if (operation === "create" && !req.user && isPublicApiRequest) {
      // Force user role - prevent self-registrants from becoming admin/editor
      data.role = "user";
      // Force BASIC trust level - lowest quotas for new self-registered users
      data.trustLevel = String(TRUST_LEVELS.BASIC);
      // Mark as self-registered
      data.registrationSource = "self";
      // Ensure account is active
      data.isActive = true;
    }

    // Auto-set quotas based on trust level ONLY when trust level actually changes
    const isTrustLevelChange =
      operation === "update" && data?.trustLevel !== undefined && originalDoc?.trustLevel !== data.trustLevel;
    if (isTrustLevelChange && DEFAULT_QUOTAS[normalizeTrustLevel(data.trustLevel)] && !data.customQuotas) {
      initializeQuotasFromTrustLevel(data, data.trustLevel);
    }

    // Initialize quotas on user creation
    if (operation === "create") {
      initializeQuotasFromTrustLevel(data, data?.trustLevel);
    }

    // SECURITY: Stamp a 24h expiry whenever a verification token is set.
    // Covers new-user creation (Payload auto-generates `_verificationToken`)
    // and re-send-verification flows that explicitly rotate the token.
    // The companion check lives in /api/users/verify/[token].
    const dataWithToken = data as Record<string, unknown>;
    if (typeof dataWithToken._verificationToken === "string" && dataWithToken._verificationToken.length > 0) {
      dataWithToken._verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    return data;
  },
];

export const usersAfterChangeHook: CollectionAfterChangeHook[] = [
  async ({ doc, previousDoc, operation, req }) => {
    if (operation !== "update" || !previousDoc) return doc;

    const targetUserId = doc.id;
    const performedBy = req.user?.id === targetUserId ? undefined : req.user?.id;

    // Audit trust level, role, and custom quota changes
    await auditFieldChanges(
      req.payload,
      {
        previousDoc: previousDoc as Record<string, unknown>,
        doc: doc as unknown as Record<string, unknown>,
        userId: targetUserId,
        userEmail: doc.email,
        performedBy,
      },
      [
        {
          action: AUDIT_ACTIONS.TRUST_LEVEL_CHANGED,
          fieldPath: "trustLevel",
          detailsFn: (oldVal, newVal) => ({ previousTrustLevel: oldVal, newTrustLevel: newVal }),
        },
        {
          action: AUDIT_ACTIONS.ROLE_CHANGED,
          fieldPath: "role",
          detailsFn: (oldVal, newVal) => ({ previousRole: oldVal, newRole: newVal }),
        },
        { action: AUDIT_ACTIONS.CUSTOM_QUOTAS_CHANGED, fieldPath: "customQuotas" },
      ],
      { req }
    );

    // Audit isActive as separate activate/deactivate actions
    if (previousDoc.isActive !== doc.isActive) {
      const action = doc.isActive ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED;
      await auditLog(
        req.payload,
        {
          action,
          userId: targetUserId,
          userEmail: doc.email,
          performedBy,
          details: { previousValue: previousDoc.isActive, newValue: doc.isActive },
        },
        { req }
      );
    }

    // Audit manual quota overrides (quotas changed WITHOUT trust level change)
    if (
      previousDoc.trustLevel === doc.trustLevel &&
      JSON.stringify(previousDoc.quotas) !== JSON.stringify(doc.quotas)
    ) {
      await auditLog(
        req.payload,
        {
          action: AUDIT_ACTIONS.QUOTA_OVERRIDDEN,
          userId: targetUserId,
          userEmail: doc.email,
          performedBy,
          details: { previousQuotas: previousDoc.quotas, newQuotas: doc.quotas },
        },
        { req }
      );
    }

    return doc;
  },
];

export const usersAfterLoginHook: CollectionAfterLoginHook[] = [
  async ({ req, user }) => {
    await auditLog(
      req.payload,
      { action: AUDIT_ACTIONS.LOGIN_SUCCESS, userId: user.id, userEmail: user.email, ipAddress: getReqIp(req) },
      { req }
    );
  },
];

export const usersAfterErrorHook: CollectionAfterErrorHook[] = [
  async ({ error, req }) => {
    // Only log authentication errors. Payload throws AuthenticationError
    // for both "no matching email" and "wrong password", which is
    // compliance-adequate — distinguishing them at this layer would
    // enable email enumeration.
    if (!(error instanceof AuthenticationError)) return;

    // `req.data` carries the login payload during the login op.
    // Email may be missing when the client sent malformed JSON.
    const data = (req as unknown as { data?: { email?: unknown } }).data;
    const attemptedEmail = typeof data?.email === "string" ? data.email : undefined;

    await auditLog(
      req.payload,
      {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        // userId=0 is the canonical "no associated user" marker for this
        // audit type. We record the attempt regardless of whether the
        // email matched a real user (avoids enumeration via audit-log
        // absence/presence).
        userId: 0,
        userEmail: attemptedEmail ?? "",
        ipAddress: getReqIp(req),
        details: attemptedEmail ? { attemptedEmailProvided: true } : { attemptedEmailProvided: false },
      },
      { req }
    );
  },
];
