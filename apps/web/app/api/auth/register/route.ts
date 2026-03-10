/**
 * Secure user registration API endpoint.
 *
 * This endpoint prevents user enumeration by returning identical responses
 * whether the email is new or already registered. This is a security best
 * practice to prevent attackers from discovering valid email addresses.
 *
 * Behavior:
 * - New email: Creates user, sends verification email, returns success
 * - Existing email: Sends notification email, returns success (same response)
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute, AppError } from "@/lib/api";
import { TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { logError, logger } from "@/lib/logger";
import { getClientIdentifier, getRateLimitService } from "@/lib/services/rate-limit-service";
import { maskEmail } from "@/lib/utils/masking";

// Rate limit config for registration (strict to prevent enumeration attacks)
const REGISTRATION_RATE_LIMIT = {
  windows: [
    { limit: 3, windowMs: 60 * 1000, name: "burst" }, // 3 per minute
    { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" }, // 10 per hour
    { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 20 per day
  ],
};

/**
 * Generates HTML email for existing account notification.
 * Sent when someone tries to register with an email that already has an account.
 */
const generateAccountExistsEmailHTML = (resetUrl: string): string => {
  return `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h1>Account Registration Attempt</h1>
        <p>Hello,</p>
        <p>Someone (possibly you) tried to create a TimeTiles account with this email address.</p>
        <p>Since you already have an account, no new account was created.</p>
        <p><strong>If this was you:</strong></p>
        <ul>
          <li>You may have forgotten you already have an account</li>
          <li>If you forgot your password, you can reset it below</li>
        </ul>
        <p style="margin: 20px 0;">
          <a href="${resetUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Reset Password
          </a>
        </p>
        <p><strong>If this wasn't you:</strong></p>
        <p>You can safely ignore this email. Your account is secure and no changes were made.</p>
        <p style="margin-top: 30px; color: #666; font-size: 12px;">
          This is an automated security notification from TimeTiles.
        </p>
      </body>
    </html>
  `;
};

export const POST = apiRoute({
  auth: "none",
  body: z.object({
    email: z.email().transform((s) => s.trim().toLowerCase()),
    password: z.string().min(8),
  }),
  handler: async ({ req, payload, body }) => {
    // Check if registration is enabled
    const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
    if (!(await isFeatureEnabled(payload, "enableRegistration"))) {
      throw new AppError(403, "Registration is currently disabled.", "FORBIDDEN");
    }

    // Apply rate limiting
    const clientId = getClientIdentifier(req);
    const rateLimitService = getRateLimitService(payload);
    const rateLimitCheck = rateLimitService.checkConfiguredRateLimit(clientId, REGISTRATION_RATE_LIMIT);

    if (!rateLimitCheck.allowed) {
      const retryAfter = rateLimitCheck.resetTime ? Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000) : 60;

      return new Response(
        JSON.stringify({ error: "Too many registration attempts. Please try again later.", retryAfter }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) } }
      );
    }

    const { email: normalizedEmail, password } = body;

    // Check if user already exists
    const existingUser = await payload.find({
      collection: "users",
      where: { email: { equals: normalizedEmail } },
      limit: 1,
      overrideAccess: true,
    });

    if (existingUser.docs.length > 0) {
      // User exists - send notification email (don't reveal this to the client)
      logger.info(`Registration attempt for existing email: ${maskEmail(normalizedEmail)}`);

      try {
        // Generate password reset URL so user can recover their account
        const baseUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL ?? "http://localhost:3000";
        const resetUrl = `${baseUrl}/forgot-password`;

        await payload.sendEmail({
          to: normalizedEmail,
          subject: "TimeTiles - Account Registration Attempt",
          html: generateAccountExistsEmailHTML(resetUrl),
        });

        logger.info(`Sent account exists notification to: ${maskEmail(normalizedEmail)}`);
      } catch (emailError) {
        // Log but don't fail - we still want to return success to prevent enumeration
        logError(emailError, `Failed to send account exists email to: ${maskEmail(normalizedEmail)}`);
      }

      // Return same success response as new registration
      return Response.json({
        success: true,
        message: "Please check your email to verify your account.",
      });
    }

    // Create new user - Payload will automatically send verification email
    try {
      await payload.create({
        collection: "users",
        data: {
          email: normalizedEmail,
          password,
          // Self-registration defaults (matches beforeChange hook logic for REST API)
          role: "user",
          trustLevel: String(TRUST_LEVELS.BASIC) as "1",
          registrationSource: "self",
          isActive: true,
        },
        // Note: Verification email is sent automatically by Payload
        // based on the auth.verify configuration in users collection
      });

      logger.info(`New user registered: ${maskEmail(normalizedEmail)}`);

      return Response.json({
        success: true,
        message: "Please check your email to verify your account.",
      });
    } catch (createError) {
      // Handle potential race condition where user was created between our check and create
      // This could happen under high concurrency
      const errorMessage = createError instanceof Error ? createError.message : String(createError);

      if (errorMessage.includes("unique") || errorMessage.includes("duplicate")) {
        // Race condition - user was created between check and create
        // Return success to prevent enumeration
        logger.warn(`Race condition during registration for: ${maskEmail(normalizedEmail)}`);

        return Response.json({
          success: true,
          message: "Please check your email to verify your account.",
        });
      }

      // Re-throw other errors
      throw createError;
    }
  },
});
