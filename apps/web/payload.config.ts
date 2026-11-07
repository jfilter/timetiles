/**
 * Main Payload CMS configuration for production and development.
 *
 * Uses buildConfigWithDefaults factory to reduce duplication and follow
 * Payload's recommended pattern. The factory handles environment-specific
 * configuration, database setup, and feature flags.
 *
 * @module
 */
import { getEnv, isBuildPhase as detectBuildPhase } from "./lib/config/env";
import { buildConfigWithDefaults } from "./lib/config/payload-config-factory";

// The build-phase config carries a public dummy secret, so production never enters it via SKIP_DB_CHECK.
const isBuildPhase = detectBuildPhase();

// Validate required environment variables outside build phase
// (getEnv() enforces this via Zod, but we keep an explicit check for a clear error message)
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

const env = getEnv();

export default buildConfigWithDefaults({
  // Use dummy values during build phase
  secret: isBuildPhase ? "dummy-build-secret" : env.PAYLOAD_SECRET,
  serverURL: isBuildPhase ? "http://localhost:3000" : env.NEXT_PUBLIC_PAYLOAD_URL,
  databaseUrl: env.DATABASE_URL,

  // During build phase, use minimal pool to avoid connections
  poolConfig: isBuildPhase ? { max: 0 } : undefined,

  // Run migrations in production, skip in build phase — and only where
  // RUN_MIGRATIONS is set, because Payload applies them without taking a lock
  // and every container that initializes Payload would otherwise migrate the
  // same database concurrently.
  runMigrations: env.NODE_ENV === "production" && !isBuildPhase && env.RUN_MIGRATIONS,
});
