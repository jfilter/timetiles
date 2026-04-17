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

    // Delegate to Payload's built-in verification. This flips `_verified` to
    // true and clears `_verificationToken` atomically in Payload's own logic.
    await payload.verifyEmail({ collection: "users", token });

    logger.info({ userId: user.id }, "Email verified successfully");
    return { success: true };
  },
});
