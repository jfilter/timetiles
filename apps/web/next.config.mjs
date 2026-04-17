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

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@timetiles/ui", "@timetiles/assets"],
  headers: async () => [{ source: "/:path*", headers: SECURITY_HEADERS }],
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
