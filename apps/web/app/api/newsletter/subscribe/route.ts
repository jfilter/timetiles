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

import { apiRoute, AppError } from "@/lib/api";
import { logError, logger } from "@/lib/logger";
import { maskEmail } from "@/lib/security/masking";
import { safeFetch } from "@/lib/security/safe-fetch";

/** Shown for every service failure; the service's own error text stays out of public responses. */
const SUBSCRIBE_FAILED_MESSAGE = "Failed to subscribe. Please try again later.";

interface Settings {
  newsletter?: { serviceUrl?: string; authHeader?: string };
}

export const POST = apiRoute({
  auth: "none",
  rateLimit: { configName: "NEWSLETTER_SUBSCRIBE" },
  body: z.object({ email: z.email() }),
  handler: async ({ body, payload }) => {
    const { email } = body;

    // Get newsletter service configuration from Payload settings
    const settings = (await payload.findGlobal({ slug: "settings", overrideAccess: true })) as Settings;

    const serviceUrl = settings.newsletter?.serviceUrl;

    if (!serviceUrl) {
      logError(
        new Error("Newsletter service not configured"),
        "Newsletter service URL not configured in Settings. Configure it at /dashboard/globals/settings"
      );
      throw new AppError(500, "Newsletter service not configured", "NEWSLETTER_NOT_CONFIGURED");
    }

    // Forward the subscription request to the configured service.
    // The service should handle authentication, list management, etc.
    // Use `safeFetch` to block SSRF — `serviceUrl` comes from the admin-configured
    // Settings global and must not be allowed to target internal networks.
    let serviceResponse: Response;
    try {
      serviceResponse = await safeFetch(serviceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward authorization if provided
          ...(settings.newsletter?.authHeader ? { Authorization: settings.newsletter.authHeader } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      logError(err, "Failed to reach newsletter service", { email: maskEmail(email) });
      throw new AppError(500, SUBSCRIBE_FAILED_MESSAGE, "NEWSLETTER_SERVICE_ERROR");
    }

    // Parse response body safely — some services return non-JSON (204, HTML errors)
    let responseData: { message?: string } = {};
    try {
      responseData = (await serviceResponse.json()) as { message?: string };
    } catch {
      // Non-JSON response — continue with empty responseData
    }

    if (!serviceResponse.ok) {
      // Handle duplicate email (already subscribed) — only 409 Conflict is unambiguous
      if (serviceResponse.status === 409) {
        logger.info({ email: maskEmail(email) }, "Email already subscribed");
        return {
          message:
            responseData.message ??
            "You may already be subscribed. Check your email for the confirmation link if you haven't confirmed yet.",
        };
      }

      // The service's response body is not logged: subscriber APIs echo the address back.
      logError(new Error(`Newsletter service error: ${serviceResponse.status}`), "Failed to subscribe email", {
        email: maskEmail(email),
        status: serviceResponse.status,
      });
      throw new AppError(500, SUBSCRIBE_FAILED_MESSAGE, "NEWSLETTER_SERVICE_ERROR");
    }

    logger.info({ email: maskEmail(email) }, "Successfully subscribed email");

    return {
      message: responseData.message ?? "Successfully subscribed! Please check your email to confirm your subscription.",
    };
  },
});
