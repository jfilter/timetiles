/**
 * Next.js configuration file.
 *
 * Configures the Next.js application with Payload CMS integration,
 * transpiles the UI package, and sets build-time options.
 *
 * @module
 */
import { withPayload } from "@payloadcms/next/withPayload";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/* eslint-disable no-undef */
const isProduction = process.env.NODE_ENV === "production";
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
];

// Clickjacking defense, set at the app level so deployments without the nginx
// proxy are still protected (and so paths outside the middleware matcher —
// /dashboard, static files — are covered). X-Frame-Options covers older
// browsers; the CSP frame-ancestors directive is the modern equivalent. A full
// resource CSP (script/style/connect-src) is intentionally left to the
// deployment proxy so it can be tuned to the configured map tile/style hosts.
//
// Embed routes are EXCLUDED here: they must be frameable from any origin. Next
// applies these headers before the proxy runs; the proxy's headers.set() then
// overrides a value, but its headers.delete() cannot remove a header added here.
// The proxy sets frame-ancestors * for /embed and X-Frame-Options DENY +
// frame-ancestors 'self' for the other front-end pages.
const FRAME_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];
const NON_EMBED_SOURCE = "/((?!embed(?:/|$))(?![a-z]{2}/embed(?:/|$)).*)";
// API routes bypass the proxy (see proxy.ts), so their headers are set here.
const API_FRAME_HEADERS = [{ key: "X-Frame-Options", value: "DENY" }];

// Uploads are served inline from this origin, so a stored SVG (accepted before the media
// collection went raster-only) is a script vector. `sandbox` blocks scripts, forms and popups;
// `default-src 'none'` stops the file reaching back to the app. Inline styles keep SVG art intact.
const UPLOADED_FILE_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // i18n/config.ts reads DEFAULT_LOCALE in client components too. Only
  // NEXT_PUBLIC_* vars are auto-inlined into the client bundle, so without
  // this passthrough a DEFAULT_LOCALE=de deployment has the server treating
  // `de` as the prefixless default while the client assumes `en` — every nav
  // link hydrates to a different href and triggers a redirect.
  env: { DEFAULT_LOCALE: process.env.DEFAULT_LOCALE ?? "en" },
  transpilePackages: ["@timetiles/ui", "@timetiles/assets"],
  poweredByHeader: false,
  // Event images are user-imported from arbitrary third-party hosts (schema
  // detection in event-creation-helpers.ts classifies any URL column pointing
  // at image extensions, regardless of domain). A static host allowlist here
  // doesn't scale across data packages, and a wildcard hostname would turn the
  // built-in image optimizer into an open SSRF-capable proxy. Left empty on
  // purpose — event-detail-content.tsx and events-list.tsx render these images
  // with `unoptimized` instead, which skips the optimizer route entirely and
  // lets the browser fetch directly from the source host.
  images: { remotePatterns: [] },
  headers: async () => [
    { source: "/:path*", headers: SECURITY_HEADERS },
    { source: NON_EMBED_SOURCE, headers: FRAME_HEADERS },
    { source: "/api/:path*", headers: API_FRAME_HEADERS },
    // Last, so its CSP overrides the frame-only one above (and any a route handler sets).
    { source: "/api/:collection/file/:path*", headers: UPLOADED_FILE_HEADERS },
  ],
  redirects: async () => [
    // Redirect Payload dashboard auth routes to main app
    { source: "/dashboard/login", destination: "/login?redirect=/dashboard", permanent: false },
    { source: "/dashboard/create-first-user", destination: "/", permanent: false },
    { source: "/dashboard/forgot-password", destination: "/login", permanent: false },
    { source: "/dashboard/reset-password", destination: "/login", permanent: false },
    // User-friendly /import URL redirects to internal /ingest route
    { source: "/import", destination: "/ingest", permanent: false },
  ],
  reactCompiler: true,
  experimental: {
    // Optimize barrel file imports for faster builds and smaller bundles
    // See: https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
    optimizePackageImports: ["lucide-react", "@xyflow/react", "@tanstack/react-query", "date-fns"],
    // Enable native View Transitions API for smooth page transitions
    viewTransition: true,
  },
  typescript: {
    // Use production tsconfig that excludes test files during build
    tsconfigPath: isProduction ? "./tsconfig.build.json" : "./tsconfig.json",
  },
};

export default withPayload(withNextIntl(nextConfig));
