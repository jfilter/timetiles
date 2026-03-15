/**
 * Newsletter subscription API endpoint.
 *
 * Handles email subscription requests and forwards them to the configured
 * newsletter service backend (e.g., Listmonk, Mailchimp, custom service).
 *
 * Configure the backend service via Settings global in Payload CMS (/dashboard/globals/settings).
 * This endpoint acts as a proxy to keep API credentials server-side.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute, AppError, ValidationError } from "@/lib/api";
import { logError, logger } from "@/lib/logger";

interface Settings {
  newsletter?: { serviceUrl?: string; authHeader?: string };
}

export const POST = apiRoute({
  auth: "none",
  rateLimit: { configName: "NEWSLETTER_SUBSCRIBE" },
  body: z.object({ email: z.email() }),
  handler: async ({ body, payload }) => {
    const { email } = body;

    // Additional email format validation (belt and suspenders with zod)
    const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError("Invalid email address");
    }

    // Get newsletter service configuration from Payload settings
    const settings = (await payload.findGlobal({ slug: "settings" })) as Settings;

    const serviceUrl = settings.newsletter?.serviceUrl;

    if (!serviceUrl) {
      logError(
        new Error("Newsletter service not configured"),
        "Newsletter service URL not configured in Settings. Configure it at /dashboard/globals/settings"
      );
      throw new AppError(500, "Newsletter service not configured", "NEWSLETTER_NOT_CONFIGURED");
    }

    // Forward the subscription request to the configured service
    // The service should handle authentication, list management, etc.
    const serviceResponse = await fetch(serviceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward authorization if provided
        ...(settings.newsletter?.authHeader ? { Authorization: settings.newsletter.authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    // Parse response body safely — some services return non-JSON (204, HTML errors)
    let responseData: { message?: string; error?: string } = {};
    try {
      responseData = (await serviceResponse.json()) as { message?: string; error?: string };
    } catch {
      // Non-JSON response — continue with empty responseData
    }

    if (!serviceResponse.ok) {
      // Handle duplicate email (already subscribed) — only 409 Conflict is unambiguous
      if (serviceResponse.status === 409) {
        logger.info({ email }, "Email already subscribed");
        return {
          message:
            responseData.message ??
            "You may already be subscribed. Check your email for the confirmation link if you haven't confirmed yet.",
        };
      }

      logError(
        new Error(`Newsletter service error: ${serviceResponse.status}`),
        `Failed to subscribe email: ${email}`,
        { status: serviceResponse.status, response: responseData }
      );
      throw new AppError(
        500,
        responseData.error ?? "Failed to subscribe. Please try again later.",
        "NEWSLETTER_SERVICE_ERROR"
      );
    }

    logger.info({ email }, "Successfully subscribed email");

    return {
      message: responseData.message ?? "Successfully subscribed! Please check your email to confirm your subscription.",
    };
  },
});
