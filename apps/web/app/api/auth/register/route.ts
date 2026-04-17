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

import { apiRoute, requireFeatureEnabled } from "@/lib/api";
import { TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { getEmailContext } from "@/lib/email/context";
import { safeSendEmail } from "@/lib/email/send";
import { generateAccountExistsEmailHTML } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { maskEmail } from "@/lib/security/masking";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePassword } from "@/lib/security/password-policy";
import { TIMING_PAD_MS, withTimingPad } from "@/lib/security/timing-pad";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";
import { AppError } from "@/lib/types/errors";
import { getBaseUrl } from "@/lib/utils/base-url";

export const POST = apiRoute({
  auth: "none",
  rateLimit: { configName: "REGISTRATION" },
  body: z.object({
    email: z.email().transform((s) => s.trim().toLowerCase()),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  }),
  handler: async ({ payload, body, req }) => {
    // Check if registration is enabled
    await requireFeatureEnabled(payload, "enableRegistration", "Registration is currently disabled.");

    const { email: normalizedEmail, password } = body;

    // Policy checks beyond Zod length bounds (HIBP k-anonymity lookup, etc).
    // Runs before timing pad so genuinely bad passwords fail fast without
    // leaking email-existence info (rate limit + timing pad still bound the
    // attacker's probing throughput).
    const policy = await validatePassword(password);
    if (!policy.ok) {
      throw new AppError(400, policy.message, `password-${policy.code}`);
    }

    // Prevent timing side-channel from distinguishing "email exists" vs "new registration"
    return withTimingPad(TIMING_PAD_MS.REGISTRATION, async () => {
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
        const baseUrl = getBaseUrl();
        const resetUrl = `${baseUrl}/forgot-password`;
        const { branding, t } = await getEmailContext(payload, existingUserDoc?.locale);

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
          const createdUser = await payload.create({
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

          const clientIp = getClientIdentifier(req);
          await auditLog(payload, {
            action: AUDIT_ACTIONS.REGISTERED,
            userId: createdUser.id,
            userEmail: normalizedEmail,
            ipAddress: clientIp === "unknown" ? undefined : clientIp,
            details: { registrationSource: "self" },
          });
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

      return successResponse;
    });
  },
});
