/**
 * Next.js configuration file.
 *
 * Configures the Next.js application with Payload CMS integration,
 * transpiles the UI package, and sets build-time options.
 *
 * @module
 */
import { withPayload } from "@payloadcms/next/withPayload";

/* eslint-disable no-undef */
const isProduction = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@timetiles/ui", "@timetiles/assets"],
  redirects: async () => [
    // Redirect Payload dashboard auth routes to main app
    {
      source: "/dashboard/login",
      destination: "/login?redirect=/dashboard",
      permanent: false,
    },
    {
      source: "/dashboard/logout",
      destination: "/logout",
      permanent: false,
    },
    {
      source: "/dashboard/create-first-user",
      destination: "/",
      permanent: false,
    },
    {
      source: "/dashboard/forgot-password",
      destination: "/login",
      permanent: false,
    },
    {
      source: "/dashboard/reset-password",
      destination: "/login",
      permanent: false,
    },
  ],
  experimental: {
    reactCompiler: false,
    // Optimize barrel file imports for faster builds and smaller bundles
    // See: https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
    optimizePackageImports: ["lucide-react", "@xyflow/react", "@timetiles/ui", "@tanstack/react-query", "date-fns"],
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
        options: {
          icon: true,
          svgProps: {
            role: "img",
          },
        },
      },
    },
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Use production tsconfig that excludes test files during build
    tsconfigPath: isProduction ? "./tsconfig.build.json" : "./tsconfig.json",
  },
  // Enable standalone output for Docker deployments
  // This reduces the image size significantly
  output: isProduction ? "standalone" : undefined,
};

export default withPayload(nextConfig);
