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

import { apiRoute } from "@/lib/api";
import { EMAIL_REGEX } from "@/lib/constants/validation";
import { logError, logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { verifyPasswordWithAudit } from "@/lib/utils/auth-helpers";
import { hashEmail } from "@/lib/utils/hash";

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

const buildOldEmailNotificationHtml = (firstName: string) => `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h1>Your email address was changed</h1>
      <p>Hello${firstName ? ` ${firstName}` : ""},</p>
      <p>The email address associated with your TimeTiles account was recently changed.</p>
      <p>If you did not make this change, please contact support immediately to secure your account.</p>
    </body>
  </html>
`;

const buildVerificationEmailHtml = (verifyUrl: string, firstName: string) => `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h1>Verify your new email address</h1>
      <p>Hello${firstName ? ` ${firstName}` : ""},</p>
      <p>You recently changed your email address on TimeTiles. Please verify your new email address by clicking the link below:</p>
      <p style="margin: 20px 0;">
        <a href="${verifyUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Verify Email
        </a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>If you didn't change your email, please contact support immediately.</p>
    </body>
  </html>
`;

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

  try {
    await payload.sendEmail({
      to: newEmail,
      subject: "Verify your new TimeTiles email address",
      html: buildVerificationEmailHtml(verifyUrl, firstName),
    });
  } catch (emailError) {
    logError(emailError, "Failed to send verification email after email change");
  }

  try {
    await payload.sendEmail({
      to: user.email,
      subject: "Your TimeTiles email address was changed",
      html: buildOldEmailNotificationHtml(firstName),
    });
  } catch (emailError) {
    logError(emailError, "Failed to send notification to old email after email change");
  }

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
  handler: async ({ payload, user, req }) => {
    // Rate limiting
    const clientId = getClientIdentifier(req);
    const rateLimitService = getRateLimitService(payload);

    const emailChangeCheck = rateLimitService.checkConfiguredRateLimit(
      `email-change:${user.id}`,
      RATE_LIMITS.EMAIL_CHANGE
    );

    if (!emailChangeCheck.allowed) {
      return Response.json({ error: "Too many email change attempts. Please try again later." }, { status: 429 });
    }

    // Parse request body
    let newEmail: string;
    let password: string;
    try {
      const body = await req.json();
      newEmail = body.newEmail?.trim().toLowerCase();
      password = body.password;
    } catch {
      return Response.json({ error: "Invalid request body", code: "BAD_REQUEST" }, { status: 400 });
    }

    if (!newEmail || !password) {
      return Response.json({ error: "New email and password are required", code: "BAD_REQUEST" }, { status: 400 });
    }

    // Validate email format
    if (!EMAIL_REGEX.test(newEmail)) {
      return Response.json({ error: "Invalid email format", code: "BAD_REQUEST" }, { status: 400 });
    }

    // Check if email is same as current
    if (newEmail === user.email.toLowerCase()) {
      return Response.json(
        { error: "New email must be different from current email", code: "BAD_REQUEST" },
        { status: 400 }
      );
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
