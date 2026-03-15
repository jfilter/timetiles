/**
 * Middleware for locale detection and routing.
 *
 * Detects the user's locale from the URL prefix, cookie, or Accept-Language header.
 * The default locale has no URL prefix; non-default locales get a prefix (e.g., /de/explore).
 * Excludes Payload admin dashboard, API routes, and static assets.
 *
 * @module
 * @category Configuration
 */

import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except:
  // - /api, /dashboard (Payload admin), /_next, /_vercel
  // - Files with extensions (e.g., favicon.ico, image.png)
  matcher: "/((?!api|dashboard|_next|_vercel|.*\\..*).*)",
};
