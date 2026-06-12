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
// Embed routes are EXCLUDED here: they must be frameable from any origin, and
// the middleware's headers.delete() cannot remove a header this static layer
// adds after middleware runs. The middleware sets frame-ancestors * for /embed
// and X-Frame-Options DENY + frame-ancestors 'self' for everything else.
const FRAME_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];
const NON_EMBED_SOURCE = "/((?!embed(?:/|$))(?![a-z]{2}/embed(?:/|$)).*)";

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
  headers: async () => [
    { source: "/:path*", headers: SECURITY_HEADERS },
    { source: NON_EMBED_SOURCE, headers: FRAME_HEADERS },
  ],
  redirects: async () => [
    // Redirect Payload dashboard auth routes to main app
    { source: "/dashboard/login", destination: "/login?redirect=/dashboard", permanent: false },
    { source: "/dashboard/logout", destination: "/logout", permanent: false },
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
