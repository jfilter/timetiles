/**
 * API route for handling preview mode in Next.js.
 *
 * Enables Next.js Draft Mode for authenticated users to view draft or unpublished
 * content from the CMS. Uses JWT authentication via HTTP-only cookies.
 *
 * @module
 */
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getPayload } from "payload";

import { logger } from "@/lib/logger";
import config from "@/payload.config";

export const GET = async (request: NextRequest): Promise<Response> => {
  const { searchParams } = request.nextUrl;

  // Get parameters from the preview URL
  const slug = searchParams.get("slug");
  const collection = searchParams.get("collection");

  // Validate required parameters
  if (slug == null || collection == null) {
    return new Response("Missing required parameters", { status: 400 });
  }

  try {
    // Verify the user is authenticated with Payload
    const payload = await getPayload({ config });

    // Properly validate JWT token using Payload's auth system
    const authCookie = request.cookies.get("payload-token");

    if (!authCookie) {
      return new Response("Authentication required", { status: 401 });
    }

    // Use Payload's auth method to validate JWT and get user
    const { user } = await payload.auth({
      headers: new Headers({
        Authorization: `Bearer ${authCookie.value}`,
      }),
    });

    if (!user) {
      return new Response("Authentication required", { status: 401 });
    }

    // Enable draft mode
    const draft = await draftMode();
    draft.enable();

    // Redirect to the appropriate page
    const redirectPath = (() => {
      switch (collection) {
        case "events":
          return `/events/${slug}`;
        case "pages":
          return `/${slug}`;
        default:
          return `/${collection}/${slug}`;
      }
    })();

    logger.info("Preview mode enabled", {
      collection,
      slug,
      userId: user.id,
    });

    redirect(redirectPath);
  } catch (error) {
    logger.error("Failed to enable preview mode", { error: error as Error });
    return new Response("Failed to enable preview mode", { status: 500 });
  }
};
