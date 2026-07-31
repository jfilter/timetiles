/**
 * Lifecycle hooks for the Users collection.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type {
  CollectionAfterChangeHook,
  CollectionAfterErrorHook,
  CollectionAfterLoginHook,
  CollectionBeforeChangeHook,
  CollectionBeforeLoginHook,
  CollectionBeforeOperationHook,
  PayloadRequest,
} from "payload";
import { APIError, AuthenticationError, LockedAuth } from "payload";

import { DEFAULT_QUOTAS, normalizeTrustLevel, TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { logError, logger } from "@/lib/logger";
import { validatePassword } from "@/lib/security/password-policy";
import { AUDIT_ACTIONS, auditFieldChanges, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier, getRateLimitService } from "@/lib/services/rate-limit-service";
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

type UsersBeforeChangeArgs = Parameters<CollectionBeforeChangeHook>[0];

/**
 * Block direct manipulation of credential/auth fields through the generic REST
 * collection API. Payload auto-generates `email`, `password`, `enableAPIKey` and
 * `apiKey` for auth collections with NO field-level access guard, so an owner
 * PATCH /api/users/:id could take over the account (swap the login email while
 * `_verified` stays true), reset the password without knowing the current one,
 * or plant a known API key as a permanent backdoor — bypassing the
 * current-password check, email verification, rate limits and audit trail the
 * dedicated routes enforce. Those routes run via the Local API
 * (`payloadAPI !== "REST"`), so gate only non-admin REST writes.
 */
const assertNoRestrictedAuthFieldWrites = ({
  data,
  operation,
  req,
  originalDoc,
}: Pick<UsersBeforeChangeArgs, "data" | "operation" | "req" | "originalDoc">): void => {
  if (!(operation === "update" && req.payloadAPI === "REST" && req.user?.role !== "admin")) return;

  const changesEmail = typeof data.email === "string" && data.email !== originalDoc?.email;
  const changesPassword = typeof data.password === "string" && data.password.length > 0;
  const changesApiKey = data.apiKey !== undefined || data.enableAPIKey !== undefined;
  if (changesEmail || changesPassword || changesApiKey) {
    throw new AppError(
      403,
      "Email, password and API keys can only be changed through their dedicated endpoints.",
      "auth-field-forbidden"
    );
  }
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
    // SECURITY: block direct REST writes to credential/auth fields (see helper).
    assertNoRestrictedAuthFieldWrites({ data, operation, req, originalDoc });

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
    // On create, Payload generates `_verificationToken` AFTER collection
    // beforeChange hooks run (it is never visible in `data` here), so stamp
    // unconditionally — the token is always generated when `auth.verify` is on.
    // On update, stamp only when a flow explicitly rotates the token (e.g.
    // change-email). The companion check lives in /api/users/verify/[token].
    const dataWithToken = data;
    const rotatesToken =
      typeof dataWithToken._verificationToken === "string" && dataWithToken._verificationToken.length > 0;
    if (operation === "create" || rotatesToken) {
      dataWithToken._verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    return data;
  },
];

export const usersBeforeLoginHook: CollectionBeforeLoginHook[] = [
  ({ user }) => {
    // Enforce account deactivation. `isActive: false` is set by admins and by
    // the account-deletion flow ("Cannot login") — without this hook nothing
    // actually blocks the login.
    if (user.isActive === false) {
      throw new APIError("This account has been deactivated.", 403);
    }
    return user;
  },
];

/**
 * Revoke everything a deactivated account can still authenticate with.
 *
 * `isActive: false` was enforced ONLY in beforeLogin, which runs in the login operation and
 * nowhere else. An already-signed-in user therefore kept full access: their existing
 * `payload-token` still authenticated every route, and `POST /api/users/refresh-token` (which
 * does not run beforeLogin) re-stamped the session and minted a fresh JWT indefinitely, so
 * deactivation never actually took effect. An issued API key was worse — Payload's API-key
 * strategy consults neither `isActive` nor sessions nor beforeLogin, so the key kept working
 * with the account's original role even after a full account deletion.
 */
const revokeCredentialsOnDeactivation: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== "update" || !previousDoc) return doc;
  if (previousDoc.isActive !== true || doc.isActive !== false) return doc;

  try {
    // Deliberately raw SQL rather than payload.update(): a nested Payload write on the SAME
    // collection from its own afterChange re-enters this hook and opens a second transaction,
    // which deadlocks (see docs/development/contributing/payload-deadlocks).
    //
    // It MUST go through getTransactionAwareDrizzle: account deletion flips isActive inside an
    // open transaction that already holds a row lock on this user, so issuing these statements
    // on the default pool connection would block on that lock until the test/request timed out.
    const db = await getTransactionAwareDrizzle(req.payload, req);
    await db.execute(sql`DELETE FROM payload.users_sessions WHERE _parent_id = ${doc.id}`);
    await db.execute(
      sql`UPDATE payload.users
          SET "enable_a_p_i_key" = false, "api_key" = NULL, "api_key_index" = NULL
          WHERE id = ${doc.id}`
    );

    logger.info({ userId: doc.id }, "Revoked sessions and API key for deactivated user");
  } catch (error) {
    // Never block the deactivation itself — a stale session is worse than nothing, but a user
    // who cannot be deactivated at all is worse still. The authenticateRequest gate holds.
    logError(error, "Failed to revoke credentials for deactivated user", { userId: doc.id });
  }

  return doc;
};

export const usersAfterChangeHook: CollectionAfterChangeHook[] = [
  revokeCredentialsOnDeactivation,
  async ({ doc, previousDoc, operation, req }) => {
    if (operation !== "update" || !previousDoc) return doc;

    const targetUserId = doc.id;
    const performedBy = req.user?.id === targetUserId ? undefined : req.user?.id;

    // Audit trust level, role, and custom quota changes
    await auditFieldChanges(
      req.payload,
      {
        previousDoc: previousDoc as Record<string, unknown>,
        doc: doc,
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

/**
 * Set on `payload.login` when the call is a password CONFIRMATION, not a sign-in.
 *
 * `verifyPassword` (lib/api/auth-helpers) confirms a password by running the real login
 * operation and then undoing its side effects — the attempt counter and the session it
 * creates. The audit entry is the third side effect: without this flag, every password
 * change, email change and deletion request appended a LOGIN_SUCCESS row for a login that
 * never happened, with no IP because no request is passed. That corrupts the very artifact
 * the audit log exists for, and the "review your recent activity" advice in the
 * deletion-cancelled email points users straight at it.
 */
export const SKIP_LOGIN_AUDIT = "skipLoginAudit";

export const usersAfterLoginHook: CollectionAfterLoginHook[] = [
  async ({ req, user }) => {
    if (req.context?.[SKIP_LOGIN_AUDIT] === true) return;

    await auditLog(
      req.payload,
      { action: AUDIT_ACTIONS.LOGIN_SUCCESS, userId: user.id, userEmail: user.email, ipAddress: getReqIp(req) },
      { req }
    );
  },
];

/**
 * Auth failures that must be indistinguishable from one another.
 *
 * `AuthenticationError` covers both "no such email" and "wrong password", but Payload
 * throws `LockedAuth` once maxLoginAttempts is reached — and only a REGISTERED address can
 * ever accumulate attempts. Anything else that surfaces as a 401 is treated the same way.
 */
const isCollapsibleAuthError = (error: Error): boolean =>
  error instanceof AuthenticationError || error instanceof LockedAuth;

export const usersAfterErrorHook: CollectionAfterErrorHook[] = [
  async ({ error, req, result }) => {
    if (!isCollapsibleAuthError(error)) return;

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

    // Collapse the RESPONSE too, not just the audit entry.
    //
    // /api/auth/login is a hardened wrapper, but Payload's own /api/users/login stays
    // registered and is served by the catch-all at app/(payload)/api/[...slug]. There,
    // LockedAuth's "This user is locked due to having too many failed login attempts"
    // went back verbatim — so six requests against an address proved whether it exists,
    // the exact oracle the wrapper was hardened to close. It also locks the real owner
    // out for lockTime, making it a targeted DoS on any known address.
    //
    // `result` carries the REST-formatted body; returning a response overrides it. In a
    // GraphQL context `result` is absent and this is a no-op, which is correct — GraphQL
    // is disabled by default here.
    if (!result) return;

    const generic = new AuthenticationError(req.t);
    return { response: { ...result, errors: [{ message: generic.message }] }, status: generic.status };
  },
];

/**
 * Apply the LOGIN and FORGOT_PASSWORD limits to Payload's own auth endpoints.
 *
 * The app has hardened wrappers at /api/auth/login and /api/auth/forgot-password
 * which carry the rate limits, the audit entries and the response-timing
 * padding. But Payload registers /api/users/login and /api/users/forgot-password
 * for every auth-enabled collection, and those are served by the catch-all — so
 * the same two operations were reachable on a second, entirely unlimited path.
 * All the abuse controls lived in the door nobody had to use.
 *
 * Enforced here rather than by removing the endpoints: `endpoints: false` would
 * disable every REST endpoint on the collection, including ones the Payload
 * admin UI needs.
 *
 * Scoped to `payloadAPI === "REST"`, which is what Payload sets for its own
 * endpoints. The app's wrappers reach these operations through the Local API,
 * where Payload sets "local" — so a request that already paid at the wrapper is
 * not charged again here.
 */
export const usersBeforeOperationHook: CollectionBeforeOperationHook[] = [
  async ({ args, operation, req }) => {
    if (operation !== "login" && operation !== "forgotPassword") return args;
    if (req.payloadAPI !== "REST") return args;

    const configName = operation === "login" ? "LOGIN" : "FORGOT_PASSWORD";
    const clientId = getClientIdentifier(req as unknown as Request);
    const result = await getRateLimitService(req.payload).checkConfiguredRateLimit(
      `${configName}:${clientId}`,
      RATE_LIMITS[configName]
    );

    if (!result.allowed) {
      throw new APIError("Too many requests", 429);
    }

    return args;
  },
];
