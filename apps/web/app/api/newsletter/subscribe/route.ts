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
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError, logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import config from "@/payload.config";

interface SubscribeRequest {
  email: string;
  [key: string]: unknown; // Allow additional fields
}

interface Settings {
  newsletter?: {
    serviceUrl?: string;
    authHeader?: string;
  };
}

export const POST = withRateLimit(
  async (request: Request) => {
    try {
      const body = (await request.json()) as SubscribeRequest;
      const { email } = body;

      // Validate email
      if (!email || typeof email !== "string") {
        return NextResponse.json({ error: "Email address is required" }, { status: 400 });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }

      // Get newsletter service configuration from Payload settings
      const payload = await getPayload({ config });
      const settings = (await payload.findGlobal({
        slug: "settings",
      })) as Settings;

      const serviceUrl = settings.newsletter?.serviceUrl;

      if (!serviceUrl) {
        logError(
          new Error("Newsletter service not configured"),
          "Newsletter service URL not configured in Settings. Configure it at /dashboard/globals/settings"
        );
        return NextResponse.json({ error: "Newsletter service not configured" }, { status: 500 });
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

      const responseData = (await serviceResponse.json()) as { message?: string; error?: string };

      if (!serviceResponse.ok) {
        // Handle duplicate email (already subscribed) - common case
        if (serviceResponse.status === 409 || serviceResponse.status === 400) {
          logger.info(`Email subscription issue: ${email}`);
          return NextResponse.json(
            {
              success: true,
              message:
                responseData.message ??
                "You may already be subscribed. Check your email for the confirmation link if you haven't confirmed yet.",
            },
            { status: 200 }
          );
        }

        logError(
          new Error(`Newsletter service error: ${serviceResponse.status}`),
          `Failed to subscribe email: ${email}`,
          { status: serviceResponse.status, response: responseData }
        );
        return NextResponse.json(
          { error: responseData.error ?? "Failed to subscribe. Please try again later." },
          { status: 500 }
        );
      }

      logger.info(`Successfully subscribed email: ${email}`);

      return NextResponse.json(
        {
          success: true,
          message:
            responseData.message ?? "Successfully subscribed! Please check your email to confirm your subscription.",
        },
        { status: 200 }
      );
    } catch (error) {
      logError(error, "Newsletter subscription error");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
  { configName: "NEWSLETTER_SUBSCRIBE" }
);
