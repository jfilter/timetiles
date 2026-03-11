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
import { randomBytes, randomInt } from "node:crypto";

import type { Payload } from "payload";
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { buildOldEmailNotificationHtml, buildVerificationEmailHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";
import { badRequest } from "@/lib/utils/api-response";
import { verifyPasswordWithAudit } from "@/lib/utils/auth-helpers";
import { safeSendEmail } from "@/lib/utils/email";
import { hashEmail } from "@/lib/utils/hash";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Update email, send verification to new address, notify old address, and audit. */
const updateEmailAndNotify = async (
  payload: Payload,
  user: { id: number; email: string; firstName?: string | null },
  newEmail: string,
  clientId: string
): Promise<void> => {
  const verificationToken = randomBytes(20).toString("hex");

  await payload.update({
    collection: "users",
    id: user.id,
    overrideAccess: true,
    data: { email: newEmail, _verified: false, _verificationToken: verificationToken },
  });

  const baseUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL ?? "http://localhost:3000";
  const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
  const firstName = user.firstName ?? "";

  await safeSendEmail(
    payload,
    {
      to: newEmail,
      subject: "Verify your new TimeTiles email address",
      html: buildVerificationEmailHtml(verifyUrl, firstName),
    },
    "Failed to send verification email after email change"
  );

  await safeSendEmail(
    payload,
    {
      to: user.email,
      subject: "Your TimeTiles email address was changed",
      html: buildOldEmailNotificationHtml(firstName),
    },
    "Failed to send notification to old email after email change"
  );

  await auditLog(payload, {
    action: AUDIT_ACTIONS.EMAIL_CHANGED,
    userId: user.id,
    userEmail: user.email,
    ipAddress: clientId,
    details: { oldEmailHash: hashEmail(user.email), newEmailHash: hashEmail(newEmail) },
  });

  logger.info({ userId: user.id, oldEmail: user.email, newEmail, clientId }, "Email changed, verification required");
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
      return badRequest("New email must be different from current email");
    }

    // Verify password
    const verifyError = await verifyPasswordWithAudit(payload, user, password, clientId, "email_change");
    if (verifyError) return verifyError;

    // Check if new email is already in use
    const existingUser = await payload.find({ collection: "users", where: { email: { equals: newEmail } }, limit: 1 });

    if (existingUser.docs.length > 0) {
      // Anti-enumeration: return identical response to prevent email discovery
      // Add random delay to mitigate timing side-channel (real path does DB + email ops)
      await new Promise((resolve) => setTimeout(resolve, randomInt(200, 800)));
      logger.info(
        { userId: user.id, attemptedEmailHash: hashEmail(newEmail) },
        "Email change blocked - email already in use"
      );
      return Response.json({
        success: true,
        message: "Email changed successfully. Please check your new email address for a verification link.",
        verificationRequired: true,
      });
    }

    await updateEmailAndNotify(payload, user, newEmail, clientId);

    return Response.json({
      success: true,
      message: "Email changed successfully. Please check your new email address for a verification link.",
      verificationRequired: true,
    });
  },
});
