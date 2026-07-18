/**
 * Custom password-reset finalize endpoint.
 *
 * Shadows Payload's built-in `POST /api/users/reset-password` (served by the
 * `(payload)` catch-all) because that operation only runs `beforeValidate`
 * hooks — never the `beforeChange` password-policy gate (ADR 0039) — so a weak
 * password would sail through, and it mints a fresh session without revoking any
 * existing ones (a reset triggered to lock out an attacker would leave the
 * attacker's session alive). This route enforces the full policy, applies the
 * reset via Payload, then revokes every session so all devices must re-auth.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute, AppError } from "@/lib/api";
import { revokeAllSessions } from "@/lib/api/auth-helpers";
import { logger } from "@/lib/logger";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePassword } from "@/lib/security/password-policy";
import { TIMING_PAD_MS, withTimingPad } from "@/lib/security/timing-pad";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";
import type { User } from "@/payload-types";

export const POST = apiRoute({
  auth: "none",
  rateLimit: { configName: "RESET_PASSWORD" },
  body: z.object({ token: z.string().min(1), password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH) }),
  handler: async ({ payload, body, req }) => {
    const clientId = getClientIdentifier(req);

    // Full policy (HIBP k-anonymity, composition rules) beyond the Zod length
    // bounds. Payload's resetPassword skips beforeChange, so this is the ONLY
    // enforcement point on the reset path.
    const policy = await validatePassword(body.password);
    if (!policy.ok) {
      throw new AppError(400, policy.message, `password-${policy.code}`);
    }

    // Constant-time so a caller cannot distinguish "valid token, weak password"
    // from "invalid/expired token" by response latency.
    return withTimingPad(TIMING_PAD_MS.PASSWORD_RESET, async () => {
      let resetUser: User | undefined;
      try {
        const result = await payload.resetPassword({
          collection: "users",
          data: { token: body.token, password: body.password },
          overrideAccess: true,
        });
        resetUser = result.user as unknown as User | undefined;
      } catch {
        // Invalid or expired token. Keep the message generic — no token oracle.
        throw new AppError(400, "This password reset link is invalid or has expired.");
      }

      if (resetUser?.id != null) {
        // Revoke every session, including the one resetPassword just minted; the
        // frontend redirects to /login for a fresh sign-in with the new password.
        await revokeAllSessions(payload, resetUser.id);
        await auditLog(payload, {
          action: AUDIT_ACTIONS.PASSWORD_RESET,
          userId: resetUser.id,
          userEmail: resetUser.email,
          ipAddress: clientId,
        });
      }

      logger.info({ clientId }, "Password reset completed");
      return { message: "Password reset successfully" };
    });
  },
});
