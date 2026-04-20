/**
 * Secure user registration API endpoint.
 *
 * This endpoint prevents user enumeration by returning identical responses
 * whether the email is new or already registered. This is a security best
 * practice to prevent attackers from discovering valid email addresses.
 *
 * Behavior:
 * - New email: Creates user, queues verification email, returns success
 * - Existing email: Sends notification email, returns success (same response)
 *
 * @module
 * @category API
 */
import type { Payload } from "payload";
import { z } from "zod";

import { apiRoute, requireFeatureEnabled } from "@/lib/api";
import { TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { getEmailContext } from "@/lib/email/context";
import { EMAIL_CONTEXTS, queueEmail } from "@/lib/email/send";
import { buildAccountExistsEmailHtml, buildAccountVerificationEmailHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { maskEmail } from "@/lib/security/masking";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePassword } from "@/lib/security/password-policy";
import { TIMING_PAD_MS, withTimingPad } from "@/lib/security/timing-pad";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";
import { AppError } from "@/lib/types/errors";
import { getBaseUrl } from "@/lib/utils/base-url";

const queueAccountExistsEmail = async (
  payload: Payload,
  normalizedEmail: string,
  locale?: string | null
): Promise<void> => {
  const baseUrl = getBaseUrl();
  const resetUrl = `${baseUrl}/forgot-password`;
  const { branding, t } = await getEmailContext(payload, locale);

  await queueEmail(
    payload,
    {
      to: normalizedEmail,
      subject: t("accountExistsSubject"),
      html: buildAccountExistsEmailHtml(resetUrl, locale, branding),
    },
    EMAIL_CONTEXTS.ACCOUNT_EXISTS
  );

  logger.info({ email: maskEmail(normalizedEmail) }, "Sent account exists notification");
};

const createUserAndQueueVerification = async (
  payload: Payload,
  req: Request,
  normalizedEmail: string,
  password: string
): Promise<void> => {
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
    disableVerificationEmail: true,
    showHiddenFields: true,
  });

  if (createdUser._verificationToken) {
    const baseUrl = getBaseUrl();
    const verifyUrl = `${baseUrl}/verify-email?token=${createdUser._verificationToken}`;
    const { branding, t } = await getEmailContext(payload, createdUser.locale);

    await queueEmail(
      payload,
      {
        to: normalizedEmail,
        subject: t("verifyAccountSubject"),
        html: buildAccountVerificationEmailHtml(verifyUrl, createdUser.firstName ?? "", createdUser.locale, branding),
      },
      EMAIL_CONTEXTS.ACCOUNT_VERIFICATION
    );
  } else {
    logger.error(
      { email: maskEmail(normalizedEmail), userId: createdUser.id },
      "New user created without verification token"
    );
  }

  logger.info({ email: maskEmail(normalizedEmail) }, "New user registered");

  const clientIp = getClientIdentifier(req);
  await auditLog(payload, {
    action: AUDIT_ACTIONS.REGISTERED,
    userId: createdUser.id,
    userEmail: normalizedEmail,
    ipAddress: clientIp === "unknown" ? undefined : clientIp,
    details: { registrationSource: "self" },
  });
};

const registerOrNotify = async (payload: Payload, req: Request, normalizedEmail: string, password: string) => {
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
    await queueAccountExistsEmail(payload, normalizedEmail, existingUserDoc?.locale);
    return;
  }

  try {
    await createUserAndQueueVerification(payload, req, normalizedEmail, password);
  } catch (createError) {
    const errorMessage = createError instanceof Error ? createError.message : String(createError);

    if (errorMessage.includes("unique") || errorMessage.includes("duplicate")) {
      // Race condition: user was created between our check and create. Re-query
      // the row so we can send the same account-exists email as the sync path —
      // otherwise we'd silently skip the email and create a message-volume
      // enumeration side-channel.
      logger.warn({ email: maskEmail(normalizedEmail) }, "Race condition during registration");

      const raceUser = await payload.find({
        collection: "users",
        where: { email: { equals: normalizedEmail } },
        limit: 1,
        overrideAccess: true,
      });

      await queueAccountExistsEmail(payload, normalizedEmail, raceUser.docs[0]?.locale);
      return;
    }

    // Re-throw non-race errors immediately
    throw createError;
  }
};

export const POST = apiRoute({
  auth: "none",
  rateLimit: { configName: "REGISTRATION" },
  body: z.object({
    email: z.email().transform((s) => s.trim().toLowerCase()),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  }),
  handler: async ({ payload, body, req }) => {
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
      await registerOrNotify(payload, req, normalizedEmail, password);
      return { message: "Please check your email to verify your account." };
    });
  },
});
