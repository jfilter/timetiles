/**
 * Main Payload CMS configuration for production and development.
 *
 * Uses buildConfigWithDefaults factory to reduce duplication and follow
 * Payload's recommended pattern. The factory handles environment-specific
 * configuration, database setup, and feature flags.
 *
 * @module
 */
import { buildConfigWithDefaults } from "./lib/config/payload-config-factory";

// During build phase, Next.js sets NEXT_PHASE environment variable or SKIP_DB_CHECK
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build" || process.env.SKIP_DB_CHECK === "true";

// Validate required environment variables outside build phase
if (!isBuildPhase) {
  if (!process.env.PAYLOAD_SECRET) {
    throw new Error("PAYLOAD_SECRET environment variable is required");
  }
  if (!process.env.NEXT_PUBLIC_PAYLOAD_URL) {
    throw new Error("NEXT_PUBLIC_PAYLOAD_URL environment variable is required");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
}

// Use factory with build phase handling
export default buildConfigWithDefaults({
  // Use dummy values during build phase
  secret: isBuildPhase ? "dummy-build-secret" : process.env.PAYLOAD_SECRET,
  serverURL: isBuildPhase ? "http://localhost:3000" : process.env.NEXT_PUBLIC_PAYLOAD_URL,
  databaseUrl: process.env.DATABASE_URL || "",

  // During build phase, use minimal pool to avoid connections
  poolConfig: isBuildPhase
    ? {
        max: 0,
      }
    : undefined,

  // Always run migrations in production, skip in build phase
  runMigrations: process.env.NODE_ENV === "production" && !isBuildPhase,
});
