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
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { ForbiddenError, NotFoundError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { isSafeLocalRedirectPath } from "@/lib/utils/local-redirect";

// Allowlist of collection slugs that support preview. Using a literal enum prevents
// open-redirect attacks (e.g. `collection=//evil.com` producing protocol-relative URLs).
const PREVIEWABLE_COLLECTIONS = ["events", "pages"] as const;

export const GET = apiRoute({
  auth: "required",
  query: z.object({
    slug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]*$/i)
      .max(200),
    collection: z.enum(PREVIEWABLE_COLLECTIONS),
  }),
  handler: async ({ user, query }) => {
    const { slug, collection } = query;

    // Draft/preview reveals unpublished CMS content, so restrict it to the
    // content roles (admin/editor). `auth: "required"` alone let any registered
    // user enable draft mode and read drafts; `auth: "admin"` would wrongly
    // exclude editors, so gate by role here.
    if (user.role !== "admin" && user.role !== "editor") {
      throw new ForbiddenError("Preview is restricted to content editors");
    }

    // Enable draft mode
    const draft = await draftMode();
    draft.enable();

    // Redirect to the appropriate page
    const redirectPath = collection === "events" ? `/events/${slug}` : `/${slug}`;

    // Belt-and-suspenders guard: even though Zod restricts inputs above, reject any
    // path that is not a plain local path. Blocks `//host`, `/\host`, and schemes.
    if (!isSafeLocalRedirectPath(redirectPath)) {
      throw new NotFoundError("Invalid preview target");
    }

    logger.info({ collection, slug, userId: user.id }, "Preview mode enabled");

    redirect(redirectPath);
  },
});
