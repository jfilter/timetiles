/**
 * API endpoint for changing a user's email address.
 *
 * Validates the new email, verifies the current password, checks for duplicates
 * with anti-enumeration protection, sends verification and notification emails,
 * and logs the change to the audit log.
 *
 * @module
 * @category API
 */
import { randomBytes } from "node:crypto";

import type { Payload } from "payload";
import { z } from "zod";

import { apiRoute, ValidationError } from "@/lib/api";
import { verifyPasswordWithAudit } from "@/lib/api/auth-helpers";
import { getEmailContext } from "@/lib/email/context";
import { EMAIL_CONTEXTS, queueEmail } from "@/lib/email/send";
import { buildOldEmailNotificationHtml, buildVerificationEmailHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { hashEmail } from "@/lib/security/hash";
import { maskEmail } from "@/lib/security/masking";
import { TIMING_PAD_MS, withTimingPad } from "@/lib/security/timing-pad";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";
import { getBaseUrl } from "@/lib/utils/base-url";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stage the new email, send verification to it, notify the old address, and audit. */
const updateEmailAndNotify = async (
  payload: Payload,
  user: { id: number; email: string; firstName?: string | null; locale?: string | null },
  newEmail: string,
  clientId: string
): Promise<void> => {
  const verificationToken = randomBytes(20).toString("hex");

  // Stage the change instead of overwriting `email`: the current (verified)
  // address must stay the working login credential until the NEW address
  // proves reachable. Overwriting up front meant a typo'd or undeliverable
  // address instantly logged the user out everywhere with no way back in
  // (login demands _verified, the old email no longer existed, and password
  // reset does not re-verify). The verify route applies the swap — and
  // re-checks uniqueness there, so no TOCTOU handling is needed here.
  await payload.update({
    collection: "users",
    id: user.id,
    overrideAccess: true,
    data: { pendingEmail: newEmail, _verificationToken: verificationToken },
  });

  const baseUrl = getBaseUrl();
  const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
  const firstName = user.firstName ?? "";
  const { branding, t } = await getEmailContext(payload, user.locale);

  await queueEmail(
    payload,
    {
      to: newEmail,
      subject: t("emailVerifySubject"),
      html: buildVerificationEmailHtml(verifyUrl, firstName, user.locale, branding),
    },
    EMAIL_CONTEXTS.EMAIL_CHANGE_VERIFICATION
  );

  await queueEmail(
    payload,
    {
      to: user.email,
      subject: t("emailChangedSubject"),
      html: buildOldEmailNotificationHtml(firstName, user.locale, branding),
    },
    EMAIL_CONTEXTS.EMAIL_CHANGE_OLD_ADDRESS
  );

  await auditLog(payload, {
    action: AUDIT_ACTIONS.EMAIL_CHANGED,
    userId: user.id,
    userEmail: user.email,
    ipAddress: clientId,
    details: { oldEmailHash: hashEmail(user.email), newEmailHash: hashEmail(newEmail) },
  });

  logger.info(
    { userId: user.id, oldEmail: maskEmail(user.email), newEmail: maskEmail(newEmail), clientId },
    "Email change staged, verification required"
  );
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST = apiRoute({
  auth: "required",
  rateLimit: { configName: "EMAIL_CHANGE", keyPrefix: (u) => `email-change:${u!.id}` },
  body: z.object({ newEmail: z.email().transform((s) => s.trim().toLowerCase()), password: z.string().min(1) }),
  handler: async ({ payload, user, req, body }) => {
    const clientId = getClientIdentifier(req);
    const { newEmail, password } = body;

    // Check if email is same as current
    if (newEmail === user.email.toLowerCase()) {
      throw new ValidationError("New email must be different from current email");
    }

    // Verify password
    await verifyPasswordWithAudit(payload, user, password, clientId, "email_change");

    // Constant-time response: both paths return after the same elapsed time
    // to prevent timing side-channel attacks from distinguishing "email exists"
    // vs "email changed". The minimum floor ensures the fake path isn't instant.
    return withTimingPad(TIMING_PAD_MS.EMAIL_CHANGE, async () => {
      const successResponse = {
        message: "Email changed successfully. Please check your new email address for a verification link.",
        verificationRequired: true,
      };

      // Check if new email is already in use. overrideAccess is required:
      // without it the Users read access scopes a non-admin to their own row,
      // so this find could never match another account — making the
      // anti-enumeration branch below dead code and leaking account existence
      // via a unique-constraint 500 vs. 200 oracle.
      const existingUser = await payload.find({
        collection: "users",
        where: { email: { equals: newEmail } },
        limit: 1,
        overrideAccess: true,
      });

      if (existingUser.docs.length > 0) {
        // Anti-enumeration: log and pad response time to match the real path
        logger.info(
          { userId: user.id, attemptedEmailHash: hashEmail(newEmail) },
          "Email change blocked - email already in use"
        );
      } else {
        await updateEmailAndNotify(payload, user, newEmail, clientId);
      }

      return successResponse;
    });
  },
});
