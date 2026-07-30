/**
 * Login wrapper that runs `payload.login` through a custom route so we can
 * emit a `LOGIN_FAILED` audit event regardless of invocation surface.
 *
 * Payload's built-in `/api/users/login` does fire the `afterError` hook on
 * authentication failures, but only when the login goes through the REST
 * dispatch path — the Local API bypasses it. Routing the frontend through
 * this wrapper means the audit event fires on every real login attempt
 * without having to duplicate Payload's validation / verification logic.
 *
 * @module
 * @category API
 */
import { APIError, AuthenticationError, generatePayloadCookie } from "payload";
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { logger } from "@/lib/logger";
import { maskEmail } from "@/lib/security/masking";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";

export const POST = apiRoute({
  auth: "none",
  rateLimit: { configName: "LOGIN" },
  body: z.object({ email: z.email().transform((s) => s.trim().toLowerCase()), password: z.string().min(1) }),
  handler: async ({ payload, body, req }) => {
    const { email, password } = body;
    const clientIp = getClientIdentifier(req);
    const ipAddress = clientIp === "unknown" ? undefined : clientIp;

    try {
      const result = await payload.login({ collection: "users", data: { email, password }, req });
      if (result.token == null || result.exp == null) {
        throw new APIError("Login completed without a session token", 500);
      }

      const authConfig = payload.collections.users.config.auth;
      const cookie = generatePayloadCookie({
        collectionAuthConfig: authConfig,
        cookiePrefix: payload.config.cookiePrefix,
        token: result.token,
      });
      const responseBody: { exp: number; token?: string; user: typeof result.user } = {
        user: result.user,
        token: result.token,
        exp: result.exp,
      };

      if (authConfig.removeTokenFromResponses) {
        delete responseBody.token;
      }

      // `afterLogin` hook handles the LOGIN_SUCCESS audit — no duplicate here.
      return Response.json(responseBody, { headers: new Headers({ "Set-Cookie": cookie }) });
    } catch (error) {
      // Audit the failed attempt. userId=0 is the canonical "no associated
      // user" marker so we don't accidentally reveal which emails exist.
      await auditLog(payload, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        userId: 0,
        userEmail: email,
        ipAddress,
        details: { reason: error instanceof AuthenticationError ? "invalid-credentials" : "other" },
      });
      logger.info(
        { email: maskEmail(email), reason: error instanceof AuthenticationError ? "auth" : "other" },
        "Login failed"
      );

      // Every authentication failure returns ONE indistinguishable response. Payload throws
      // AuthenticationError for an unknown email but LockedAuth ("This user is locked due to
      // having too many failed login attempts") once maxLoginAttempts is hit — and only a
      // registered address can ever accumulate attempts. Forwarding that message verbatim
      // turned six requests into a reliable account-existence oracle, defeating the timing
      // padding that /register and /forgot-password use for exactly this reason. The real
      // cause is logged and audited above.
      //
      // A 403 from the deactivation hook is deliberately NOT collapsed: it is only reachable
      // with correct credentials, so it reveals nothing the caller does not already know.
      if (error instanceof APIError && error.status === 403) throw error;
      throw new AuthenticationError();
    }
  },
});
