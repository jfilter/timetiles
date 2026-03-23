/**
 * Middleware for locale detection, routing, and iframe security headers.
 *
 * Detects the user's locale from the URL prefix, cookie, or Accept-Language header.
 * The default locale has no URL prefix; non-default locales get a prefix (e.g., /de/explore).
 * Excludes Payload admin dashboard, API routes, and static assets.
 *
 * Embed routes (`/embed/...`) receive permissive `frame-ancestors` headers so they
 * can be loaded inside iframes on external sites. All other routes deny framing.
 *
 * @module
 * @category Configuration
 */

import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/** Matches `/embed`, `/{locale}/embed`, and any sub-paths. */
const EMBED_ROUTE_PATTERN = /^\/(?:[a-z]{2}\/)?embed(?:\/|$)/;

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  const { pathname } = request.nextUrl;

  if (EMBED_ROUTE_PATTERN.test(pathname)) {
    // Allow embedding from any origin
    response.headers.delete("X-Frame-Options");
    response.headers.set("Content-Security-Policy", "frame-ancestors *");
  } else {
    // Prevent framing of non-embed pages
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  }

  return response;
}

export const config = {
  // Match all pathnames except:
  // - /api, /dashboard (Payload admin), /_next, /_vercel
  // - Files with extensions (e.g., favicon.ico, image.png)
  matcher: "/((?!api|dashboard|_next|_vercel|.*\\..*).*)",
};
