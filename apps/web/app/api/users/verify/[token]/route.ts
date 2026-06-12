/**
 * Email verification endpoint with TTL enforcement.
 *
 * Wraps Payload's built-in `verifyEmail` so we can enforce a 24-hour expiry on
 * verification tokens (Payload v3 does not expire them natively). The companion
 * field `_verificationTokenExpiresAt` is stamped by the Users collection's
 * `beforeChange` hook whenever `_verificationToken` is set.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute, AppError } from "@/lib/api";
import { logger } from "@/lib/logger";
import { hashOpaqueValue } from "@/lib/security/hash";

interface UserWithVerificationToken {
  id: number | string;
  _verificationTokenExpiresAt?: string | Date | null;
  pendingEmail?: string | null;
}

export const POST = apiRoute({
  auth: "none",
  params: z.object({ token: z.string().min(1) }),
  handler: async ({ payload, params }) => {
    const { token } = params;

    // Look the user up by raw verification token. We bypass access control here
    // because the `_verificationToken` field is (correctly) hidden from public
    // reads — only the token holder has the secret, and finding them by token
    // is the whole point of the verification flow.
    const result = await payload.find({
      collection: "users",
      where: { _verificationToken: { equals: token } },
      limit: 1,
      overrideAccess: true,
    });

    const user = result.docs[0] as UserWithVerificationToken | undefined;

    if (!user) {
      logger.info({ tokenHash: hashOpaqueValue(token) }, "Email verification failed — no user matches token");
      throw new AppError(400, "Token expired. Please request a new verification email.", "VERIFICATION_TOKEN_INVALID");
    }

    const expiresAtRaw = user._verificationTokenExpiresAt;
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).getTime() : NaN;

    // Treat missing/unparseable TTLs as expired. Any legitimate token set
    // through the Users collection hook will have a valid ISO timestamp; a
    // missing value means the token predates the TTL rollout or was tampered
    // with — either way, force a refresh rather than accept it.
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      logger.info({ userId: user.id, tokenHash: hashOpaqueValue(token) }, "Email verification failed — token expired");
      throw new AppError(400, "Token expired. Please request a new verification email.", "VERIFICATION_TOKEN_EXPIRED");
    }

    // Email-change confirmation: the change-email route stages the new
    // address in `pendingEmail` (the verified current email keeps working as
    // the login credential until the new one proves reachable). Apply the
    // swap here instead of delegating to verifyEmail.
    if (user.pendingEmail) {
      try {
        await payload.update({
          collection: "users",
          id: user.id,
          overrideAccess: true,
          data: { email: user.pendingEmail, pendingEmail: null, _verificationToken: null, _verified: true },
        });
      } catch {
        // Uniqueness is re-checked by the DB at swap time: another account
        // may have claimed the address since the change was requested.
        logger.info({ userId: user.id }, "Email change confirmation failed — address no longer available");
        throw new AppError(
          409,
          "This email address is no longer available. Please request the change again.",
          "EMAIL_NO_LONGER_AVAILABLE"
        );
      }

      logger.info({ userId: user.id }, "Email change confirmed");
      return { success: true };
    }

    // Delegate to Payload's built-in verification. This flips `_verified` to
    // true and clears `_verificationToken` atomically in Payload's own logic.
    await payload.verifyEmail({ collection: "users", token });

    logger.info({ userId: user.id }, "Email verified successfully");
    return { success: true };
  },
});
