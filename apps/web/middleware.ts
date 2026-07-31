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
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/** Matches `/embed`, `/{locale}/embed`, and any sub-paths. */
const EMBED_ROUTE_PATTERN = /^\/(?:[a-z]{2}\/)?embed(?:\/|$)/;
const API_ROUTE_PATTERN = /^\/api(?:\/|$)/;
/** Payload serves uploaded files from `/api/{collection}/file/{filename}`. */
const UPLOADED_FILE_PATTERN = /^\/api\/[^/]+\/file\//;

const intlMiddleware = createMiddleware(routing);

/**
 * Neutralize uploaded files that a browser would otherwise treat as active documents.
 *
 * Uploads are served inline from this origin, so an SVG is a script-execution vector: the
 * media collection no longer ACCEPTS svg, but files stored before that restriction are
 * still served, and only a response header can defuse those. `sandbox` blocks scripts,
 * forms and popups; `default-src 'none'` stops the file reaching back to the app; and
 * `nosniff` keeps a mislabelled file from being re-interpreted as HTML.
 *
 * Raster images and downloads are unaffected — neither needs script, and inline styles are
 * still permitted so SVG artwork renders correctly.
 */
const applyUploadedFileHeaders = (response: Response) => {
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'"
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
};

const applyFrameHeaders = (request: NextRequest, response: Response) => {
  const { pathname } = request.nextUrl;

  if (UPLOADED_FILE_PATTERN.test(pathname)) {
    return applyUploadedFileHeaders(response);
  }

  if (EMBED_ROUTE_PATTERN.test(pathname)) {
    // Allow embedding from any origin
    response.headers.delete("X-Frame-Options");
    response.headers.set("Content-Security-Policy", "frame-ancestors *");
  } else {
    // Prevent framing of non-embed pages, including API routes
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  }

  return response;
};

export default function middleware(request: NextRequest) {
  if (API_ROUTE_PATTERN.test(request.nextUrl.pathname)) {
    return applyFrameHeaders(request, NextResponse.next());
  }

  return applyFrameHeaders(request, intlMiddleware(request));
}

export const config = {
  // Match API routes explicitly plus all front-end pathnames except:
  // - /dashboard (Payload admin), /_next, /_vercel
  // - Files with extensions (e.g., favicon.ico, image.png)
  matcher: ["/api/:path*", "/((?!dashboard|_next|_vercel|.*\\..*).*)"],
};
