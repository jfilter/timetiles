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
import { getEmailBranding } from "@/lib/email/branding";
import { getEmailTranslations } from "@/lib/email/i18n";
import { safeSendEmail } from "@/lib/email/send";
import { generateAccountExistsEmailHTML } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { maskEmail } from "@/lib/security/masking";

// Rate limit config for registration (strict to prevent enumeration attacks)
const REGISTRATION_RATE_LIMIT = {
  windows: [
    { limit: 3, windowMs: 60 * 1000, name: "burst" }, // 3 per minute
    { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" }, // 10 per hour
    { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 20 per day
  ],
};

export const POST = apiRoute({
  auth: "none",
  rateLimit: { config: REGISTRATION_RATE_LIMIT },
  body: z.object({ email: z.email().transform((s) => s.trim().toLowerCase()), password: z.string().min(8) }),
  handler: async ({ payload, body }) => {
    // Check if registration is enabled
    const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
    if (!(await isFeatureEnabled(payload, "enableRegistration"))) {
      throw new AppError(403, "Registration is currently disabled.", "FORBIDDEN");
    }

    const { email: normalizedEmail, password } = body;

    // Prevent timing side-channel from distinguishing "email exists" vs "new registration"
    const RESPONSE_FLOOR_MS = 1500;
    const startTime = Date.now();

    const successResponse = { message: "Please check your email to verify your account." };

    // Check if user already exists
    const existingUser = await payload.find({
      collection: "users",
      where: { email: { equals: normalizedEmail } },
      limit: 1,
      overrideAccess: true,
    });

    if (existingUser.docs.length > 0) {
      // User exists - send notification email (don't reveal this to the client)
      const existingUserDoc = existingUser.docs[0];
      logger.info({ email: maskEmail(normalizedEmail) }, "Registration attempt for existing email");

      // Generate password reset URL so user can recover their account
      const baseUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/forgot-password`;
      const branding = await getEmailBranding(payload);
      const t = getEmailTranslations(existingUserDoc?.locale, { siteName: branding.siteName });

      await safeSendEmail(
        payload,
        {
          to: normalizedEmail,
          subject: t("accountExistsSubject"),
          html: generateAccountExistsEmailHTML(resetUrl, existingUserDoc?.locale, branding),
        },
        `Failed to send account exists email to: ${maskEmail(normalizedEmail)}`
      );

      logger.info({ email: maskEmail(normalizedEmail) }, "Sent account exists notification");
    } else {
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

        logger.info({ email: maskEmail(normalizedEmail) }, "New user registered");
      } catch (createError) {
        // Handle potential race condition where user was created between our check and create
        // This could happen under high concurrency
        const errorMessage = createError instanceof Error ? createError.message : String(createError);

        if (errorMessage.includes("unique") || errorMessage.includes("duplicate")) {
          // Race condition - user was created between check and create
          // Fall through to timing pad + return
          logger.warn({ email: maskEmail(normalizedEmail) }, "Race condition during registration");
        } else {
          // Re-throw non-race errors immediately
          throw createError;
        }
      }
    }

    // Pad both paths to the same minimum duration
    const elapsed = Date.now() - startTime;
    if (elapsed < RESPONSE_FLOOR_MS) {
      await new Promise((resolve) => setTimeout(resolve, RESPONSE_FLOOR_MS - elapsed));
    }

    return successResponse;
  },
});
