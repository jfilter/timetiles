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
  transpilePackages: ["@workspace/ui"],
  experimental: {
    reactCompiler: false,
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
