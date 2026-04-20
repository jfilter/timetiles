/**
 * Public forgot-password API endpoint.
 *
 * Uses Payload to generate reset tokens but queues email delivery through the
 * shared `send-email` job so auth emails follow the same retry/visibility path
 * as the rest of the app-managed transactional email system.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { getEmailContext } from "@/lib/email/context";
import { EMAIL_CONTEXTS, queueEmail } from "@/lib/email/send";
import { buildResetPasswordEmailHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { maskEmail } from "@/lib/security/masking";
import { TIMING_PAD_MS, withTimingPad } from "@/lib/security/timing-pad";
import { getBaseUrl } from "@/lib/utils/base-url";

export const POST = apiRoute({
  auth: "none",
  rateLimit: { configName: "FORGOT_PASSWORD" },
  body: z.object({ email: z.email().transform((value) => value.trim().toLowerCase()) }),
  handler: async ({ payload, body }) => {
    return withTimingPad(TIMING_PAD_MS.FORGOT_PASSWORD, async () => {
      const successResponse = {
        message: "If an account exists for that email, we've sent password reset instructions.",
      };

      const users = await payload.find({
        collection: "users",
        where: { email: { equals: body.email } },
        limit: 1,
        overrideAccess: true,
      });

      const existingUser = users.docs[0];
      const token = await payload.forgotPassword({
        collection: "users",
        data: { email: body.email },
        disableEmail: true,
      });

      if (token && existingUser) {
        const baseUrl = getBaseUrl();
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;
        const { branding, t } = await getEmailContext(payload, existingUser.locale);

        await queueEmail(
          payload,
          {
            to: body.email,
            subject: t("resetPasswordSubject"),
            html: buildResetPasswordEmailHtml(resetUrl, existingUser.firstName ?? "", existingUser.locale, branding),
          },
          EMAIL_CONTEXTS.PASSWORD_RESET
        );

        logger.info({ email: maskEmail(body.email) }, "Queued password reset email");
      } else {
        logger.info({ email: maskEmail(body.email) }, "Password reset requested for non-existent email");
      }

      return successResponse;
    });
  },
});
