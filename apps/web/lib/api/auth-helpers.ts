/**
 * Shared authentication helper functions for account API routes.
 *
 * @module
 * @category API
 */
import { commitTransaction, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";

import { AppError, ForbiddenError } from "@/lib/api/errors";
import { isPrivileged } from "@/lib/collections/shared-fields";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { type FeatureFlags, getFeatureFlagService } from "@/lib/services/feature-flag-service";
import { resolveSite } from "@/lib/services/resolution/site-resolver";
import type { User } from "@/payload-types";

/** Payload relation IDs can be a number, stringified number, null, or undefined. */
type OwnerId = number | string | null | undefined;

/**
 * Check if a user can manage a resource based on role or ownership.
 * Admins and editors can manage any resource; regular users only their own.
 */
export const canManageResource = (user: { id: number; role?: string | null }, ownerId: OwnerId): boolean => {
  if (isPrivileged(user)) return true;
  return ownerId != null && ownerId === user.id;
};

/**
 * Require that the user has admin role.
 * @throws {ForbiddenError} if user is not an admin
 */
export const requireAdmin = (user: { role?: string | null }): void => {
  if (user.role !== "admin") {
    throw new ForbiddenError("Admin access required");
  }
};

/**
 * Require that the user has editor or admin role.
 * @throws {ForbiddenError} if user is not privileged
 */
export const requirePrivileged = (user: { role?: string | null }): void => {
  if (!isPrivileged(user)) {
    throw new ForbiddenError("Editor or admin access required");
  }
};

/**
 * Require that the user owns the resource or is an admin.
 * @throws {ForbiddenError} if neither condition is met
 */
export const requireOwnerOrAdmin = (user: { id: number; role?: string | null }, ownerId: OwnerId): void => {
  if (user.role === "admin") return;
  if (ownerId != null && ownerId === user.id) return;
  throw new ForbiddenError("Access denied");
};

/**
 * Require that a feature flag is enabled.
 * @throws {ForbiddenError} if the feature is disabled
 */
export const requireFeatureEnabled = async (
  payload: Payload,
  flag: keyof FeatureFlags,
  message = "Feature is not enabled"
): Promise<void> => {
  const enabled = await getFeatureFlagService(payload).isEnabled(flag);
  if (!enabled) {
    throw new ForbiddenError(message);
  }
};

/**
 * Require that the scrapers feature flag is enabled.
 * @throws {ForbiddenError} if the feature is disabled
 */
export const requireScrapersEnabled = async (payload: Payload): Promise<void> =>
  requireFeatureEnabled(payload, "enableScrapers", "Scraper feature is not enabled");

/**
 * Require that the request originates from the default (main) site.
 * Non-default sites are display-only and cannot perform data ingestion.
 * @throws {ForbiddenError} if the request is from a non-default site
 */
export const requireDefaultSite = async (payload: Payload, req: { headers: Headers }): Promise<void> => {
  const host = req.headers.get("host");
  const site = await resolveSite(payload, host);
  if (site && !site.isDefault) {
    throw new ForbiddenError("This feature is only available on the main site");
  }
};

/**
 * Decode the `sid` (session id) claim from a Payload-issued JWT without
 * verifying the signature. The token is freshly minted by `payload.login`, so
 * the only goal here is to read back the session id that login just created.
 * Returns `null` if the token is malformed or carries no `sid`.
 */
const decodeSessionIdFromToken = (token: string | undefined): string | null => {
  if (!token) return null;
  const payloadSegment = token.split(".")[1];
  if (payloadSegment === undefined) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as { sid?: unknown };
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
};

/**
 * Confirming an already-authenticated user's password must not mint a real
 * login session. `payload.login` always appends a session row (sessions are
 * enabled on the Users collection) whose token we discard, leaving an orphan
 * row that lingers until the user's next real login. Remove that just-created
 * session so password confirmation has no lasting session side effect.
 */
const revokeVerificationSession = async (payload: Payload, user: User, token: string | undefined): Promise<void> => {
  const sid = decodeSessionIdFromToken(token);
  if (!sid) return;
  try {
    const current = await payload.findByID({ collection: "users", id: user.id, depth: 0, overrideAccess: true });
    const remaining = (current.sessions ?? []).filter((session) => session.id !== sid);
    await payload.update({ collection: "users", id: user.id, data: { sessions: remaining }, overrideAccess: true });
  } catch (error) {
    // Best-effort cleanup: a stale orphan session is harmless (it expires on
    // its own and is pruned on next login), so never fail the request over it.
    logger.warn({ userId: user.id, error }, "Failed to revoke password-verification session");
  }
};

/**
 * Revoke every session except the one that issued the current request.
 *
 * Called after a password change so a stolen or older session cannot outlive the
 * reset — the whole point of changing a password to lock out an attacker. The
 * session that made this request (identified by the `sid` in its token) is kept
 * so the legitimate user stays logged in on this device. If the current session
 * id cannot be determined we drop ALL sessions (fail closed — the user simply
 * re-authenticates). Best-effort: the password change has already committed, so
 * a failure here is logged rather than surfaced.
 */
export const revokeOtherSessions = async (
  payload: Payload,
  user: User,
  currentToken: string | undefined
): Promise<void> => {
  const currentSid = decodeSessionIdFromToken(currentToken);
  try {
    const current = await payload.findByID({ collection: "users", id: user.id, depth: 0, overrideAccess: true });
    const sessions = current.sessions ?? [];
    const remaining = currentSid ? sessions.filter((session) => session.id === currentSid) : [];
    if (remaining.length === sessions.length) return;
    await payload.update({ collection: "users", id: user.id, data: { sessions: remaining }, overrideAccess: true });
  } catch (error) {
    logger.warn({ userId: user.id, error }, "Failed to revoke other sessions after password change");
  }
};

/**
 * Reset a user's password AND clear every session, atomically.
 *
 * A password reset is finalized from an unauthenticated request with only an
 * emailed token, so — unlike an in-session password change (which keeps the
 * current device via {@link revokeOtherSessions}) — there is no session to
 * preserve, and the reset is precisely the moment to lock out any pre-existing
 * (possibly attacker) session. Payload's built-in resetPassword commits the new
 * password AND mints a fresh session on its own; wiping sessions as a separate,
 * best-effort write meant a transient failure there left the old + new sessions
 * alive while the caller still returned success.
 *
 * Running both inside ONE transaction fixes that: the password change and the
 * `sessions: []` wipe commit together or roll back together. A rollback also
 * un-consumes the reset token (resetPassword's expiry reset is undone), so the
 * emailed link stays usable for a retry rather than being silently burned.
 *
 * @returns the reset user, or undefined if resetPassword returned none.
 * @throws if the token is invalid/expired or the transaction fails.
 */
export const resetPasswordAndRevokeSessions = async (
  payload: Payload,
  token: string,
  password: string
): Promise<User | undefined> => {
  const req = { payload, transactionID: undefined, context: {} } as Pick<
    PayloadRequest,
    "payload" | "transactionID" | "context"
  >;
  const ownsTransaction = await initTransaction(req);
  try {
    const result = await payload.resetPassword({
      collection: "users",
      data: { token, password },
      overrideAccess: true,
      req,
    });
    const user = result.user as unknown as User | undefined;
    if (user?.id != null) {
      await payload.update({ collection: "users", id: user.id, data: { sessions: [] }, overrideAccess: true, req });
    }
    if (ownsTransaction) await commitTransaction(req);
    return user;
  } catch (error) {
    if (ownsTransaction) await killTransaction(req);
    throw error;
  }
};

/**
 * Verify a user's password by attempting a login.
 * Throws an error with a descriptive message on failure.
 *
 * Password confirmation runs for an already-authenticated session, so it must
 * not affect the shared login lockout counter or leak a session:
 * - On failure, reset the login-attempt counter that `payload.login`
 *   increments (and may lock the account on), so repeated mistypes here cannot
 *   lock a legitimate user out of the real `/api/auth/login` path.
 * - On success, revoke the session `payload.login` just created.
 */
const verifyPassword = async (payload: Payload, user: User, password: string): Promise<void> => {
  let result: Awaited<ReturnType<typeof payload.login>>;
  try {
    result = await payload.login({ collection: "users", data: { email: user.email, password }, depth: 0 });
  } catch {
    // `payload.login` increments loginAttempts (and may set lockUntil) outside
    // the request transaction, so the side effect persists. Undo it here: a
    // failed in-session password confirmation must never lock the account.
    // `unlock` matches the user by email and resets loginAttempts/lockUntil; it
    // ignores the password value (typed only for parity with the login op).
    try {
      await payload.unlock({ collection: "users", data: { email: user.email, password }, overrideAccess: true });
    } catch (unlockError) {
      logger.warn({ userId: user.id, error: unlockError }, "Failed to reset login attempts after password check");
    }
    logger.warn({ userId: user.id }, "Failed password verification");
    throw new Error("Password is incorrect");
  }

  await revokeVerificationSession(payload, user, result.token);
};

/**
 * Verify a user's password and log a failed attempt to the audit log.
 * Throws AppError(401) on failure.
 *
 * @param errorMessage - Custom error message for the 401 response (default: "Password is incorrect")
 * @throws {AppError} with status 401 if the password is incorrect
 */
export const verifyPasswordWithAudit = async (
  payload: Payload,
  user: User,
  password: string,
  clientId: string,
  context: string,
  errorMessage: string = "Password is incorrect"
): Promise<void> => {
  try {
    await verifyPassword(payload, user, password);
  } catch {
    await auditLog(payload, {
      action: AUDIT_ACTIONS.PASSWORD_VERIFY_FAILED,
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientId,
      details: { context },
    });
    throw new AppError(401, errorMessage);
  }
};
