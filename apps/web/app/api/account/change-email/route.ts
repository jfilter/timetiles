/**
 * API endpoint for changing user email.
 *
 * Requires password verification before allowing the email to be changed.
 * Checks that the new email is not already in use.
 * After changing, sets the account as unverified and sends a verification
 * email to the new address, matching the registration flow's security model.
 *
 * @module
 * @category API
 */
import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { EMAIL_REGEX } from "@/lib/constants/validation";
import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { badRequest, createErrorHandler } from "@/lib/utils/api-response";
import { verifyPasswordWithAudit } from "@/lib/utils/auth-helpers";
import { hashEmail } from "@/lib/utils/hash";
import config from "@/payload.config";

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

/** Update email, send verification to new address, notify old address, and audit. */
const updateEmailAndNotify = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
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

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  const handleError = createErrorHandler("change email", logger);
  try {
    const payload = await getPayload({ config });
    const user = request.user!;

    // Rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimitService = getRateLimitService(payload);

    // Check email change rate limit
    const emailChangeCheck = rateLimitService.checkConfiguredRateLimit(
      `email-change:${user.id}`,
      RATE_LIMITS.EMAIL_CHANGE
    );

    if (!emailChangeCheck.allowed) {
      return NextResponse.json({ error: "Too many email change attempts. Please try again later." }, { status: 429 });
    }

    // Parse request body
    let newEmail: string;
    let password: string;
    try {
      const body = await request.json();
      newEmail = body.newEmail?.trim().toLowerCase();
      password = body.password;
    } catch {
      return badRequest("Invalid request body");
    }

    if (!newEmail || !password) {
      return badRequest("New email and password are required");
    }

    // Validate email format
    if (!EMAIL_REGEX.test(newEmail)) {
      return badRequest("Invalid email format");
    }

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
      return badRequest("Email is already in use");
    }

    await updateEmailAndNotify(payload, user, newEmail, clientId);

    return NextResponse.json({
      success: true,
      message: "Email changed successfully. Please check your new email address for a verification link.",
      newEmail,
      verificationRequired: true,
    });
  } catch (error) {
    return handleError(error);
  }
});
