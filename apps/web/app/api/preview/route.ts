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

import { apiRoute, ValidationError } from "@/lib/api";
import { logger } from "@/lib/logger";

export const GET = apiRoute({
  auth: "required",
  handler: async ({ req, user }) => {
    const { searchParams } = req.nextUrl;

    // Get parameters from the preview URL
    const slug = searchParams.get("slug");
    const collection = searchParams.get("collection");

    // Validate required parameters
    if (slug == null || collection == null) {
      throw new ValidationError("Missing required parameters");
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
  },
});
