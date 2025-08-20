/**
 * Next.js configuration file.
 *
 * Configures the Next.js application with Payload CMS integration,
 * transpiles the UI package, and sets build-time options.
 *
 * @module
 */
import { withPayload } from "@payloadcms/next/withPayload";

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
};

export default withPayload(nextConfig);
