/**
 * Factory for creating environment-specific Payload CMS configurations.
 *
 * Provides a centralized way to create Payload configurations for different environments
 * (production, test, development) with consistent settings and reduced duplication.
 * Handles database connections, plugin initialization, and environment-specific overrides.
 *
 * @module
 * @category Configuration
 */

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type { Config } from "payload";
import { buildConfig } from "payload";
import sharp from "sharp";

import Users from "@/lib/collections/users";

import type { CollectionName } from "./payload-shared-config";
import {
  ALL_GLOBALS,
  ALL_JOBS,
  COLLECTIONS,
  DEFAULT_COLLECTIONS,
  DEFAULT_DB_CONFIG,
  DEFAULT_TYPESCRIPT_CONFIG,
  DEFAULT_UPLOAD_CONFIG,
} from "./payload-shared-config";

// Re-export for convenience
export type { CollectionName } from "./payload-shared-config";
export { COLLECTIONS, DEFAULT_COLLECTIONS } from "./payload-shared-config";

export interface PayloadConfigOptions {
  // Environment type
  environment?: "production" | "test" | "development";

  // Database configuration
  databaseUrl?: string;

  // Server configuration
  secret?: string;
  serverURL?: string;

  // Feature flags
  disableAdmin?: boolean;
  disableGraphQL?: boolean;

  // Collections to include (defaults based on environment)
  collections?: CollectionName[];

  // Database pool configuration
  poolConfig?: {
    max?: number;
    connectionString?: string;
  };

  // Logging configuration
  logLevel?: "debug" | "info" | "warn" | "error" | "fatal" | "silent";

  // Migration configuration
  runMigrations?: boolean;

  // Upload configuration
  uploadLimits?: {
    fileSize?: number;
  };
}

// Helper function to validate production requirements
const validateProductionConfig = (environment: string, secret?: string, serverURL?: string, databaseUrl?: string) => {
  if (environment !== "production") return;

  if (!secret) {
    throw new Error("PAYLOAD_SECRET environment variable is required");
  }
  if (!serverURL) {
    throw new Error("NEXT_PUBLIC_PAYLOAD_URL environment variable is required");
  }
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
};

// Helper function to configure logger
const createLoggerConfig = (logLevel: string | undefined, environment: string) => {
  if (logLevel === "silent") {
    return { options: { level: "fatal" } };
  }
  if (logLevel) {
    return { options: { level: logLevel } };
  }
  if (environment === "test") {
    return { options: { level: "fatal" } };
  }
  return undefined;
};

// Helper function to create database configuration
const createDatabaseConfig = (
  databaseUrl: string | undefined,
  environment: string,
  poolConfig: { max?: number; connectionString?: string } | undefined,
  runMigrations: boolean
) =>
  postgresAdapter({
    ...DEFAULT_DB_CONFIG,
    pool: {
      connectionString: databaseUrl ?? "",
      max: environment === "test" ? 5 : undefined,
      ...poolConfig,
    },
    prodMigrations: runMigrations ? DEFAULT_DB_CONFIG.prodMigrations : undefined,
  });

// Helper function to add production-specific configuration
const addProductionConfig = (
  config: Config,
  environment: string,
  serverURL?: string,
  uploadLimits?: { fileSize?: number }
) => {
  if (environment !== "production" || !serverURL) return;

  config.serverURL = serverURL;
  config.cors = [serverURL];
  config.csrf = [serverURL];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config.sharp = sharp as any;
  config.upload = {
    ...DEFAULT_UPLOAD_CONFIG,
    limits: {
      fileSize: uploadLimits?.fileSize ?? DEFAULT_UPLOAD_CONFIG.limits.fileSize,
    },
  };
};

/**
 * Creates a Payload configuration with the specified options.
 */
export const createPayloadConfig = async (options: PayloadConfigOptions = {}) => {
  const {
    environment = process.env.NODE_ENV || "development",
    databaseUrl = process.env.DATABASE_URL,
    secret = process.env.PAYLOAD_SECRET,
    serverURL = process.env.NEXT_PUBLIC_PAYLOAD_URL,
    disableAdmin = false,
    disableGraphQL = true,
    collections = DEFAULT_COLLECTIONS[environment] ?? DEFAULT_COLLECTIONS.production,
    poolConfig,
    logLevel,
    runMigrations = true,
    uploadLimits,
  } = options;

  // Validate production requirements
  validateProductionConfig(environment, secret, serverURL, databaseUrl);

  // Select collections based on the provided list
  const selectedCollections = (collections ?? []).map((name) => COLLECTIONS[name]).filter(Boolean);

  // Create base configuration
  const config: Config = {
    secret: secret ?? "default-secret-key",
    admin: {
      user: collections?.includes("users") ? Users.slug : undefined,
      disable: disableAdmin ?? environment === "test",
    },
    logger: createLoggerConfig(logLevel, environment),
    debug: environment === "development",
    collections: selectedCollections,
    globals: ALL_GLOBALS,
    jobs: {
      tasks: ALL_JOBS,
    },
    editor: lexicalEditor({}),
    typescript: DEFAULT_TYPESCRIPT_CONFIG,
    db: createDatabaseConfig(databaseUrl, environment, poolConfig, runMigrations),
    graphQL: {
      disable: disableGraphQL,
    },
  };

  // Add production-specific configuration
  addProductionConfig(config, environment, serverURL, uploadLimits);
  
  // Add upload config for test and development environments
  if (environment === "test" || environment === "development") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config.sharp = sharp as any;
    config.upload = {
      ...DEFAULT_UPLOAD_CONFIG,
      limits: {
        fileSize: uploadLimits?.fileSize ?? DEFAULT_UPLOAD_CONFIG.limits.fileSize,
      },
    };
  }

  return buildConfig(config);
};

/**
 * Creates a production Payload configuration.
 */
export const createProductionConfig = async () =>
  createPayloadConfig({
    environment: "production",
  });

/**
 * Creates a test Payload configuration with sensible defaults.
 */
export const createTestConfig = async (options: Partial<PayloadConfigOptions> = {}) =>
  createPayloadConfig({
    environment: "test",
    disableAdmin: true,
    disableGraphQL: true,
    logLevel: "silent",
    poolConfig: {
      max: 5,
    },
    ...options,
  });

/**
 * Creates a minimal test configuration for unit tests.
 */
export const createMinimalTestConfig = async (options: Partial<PayloadConfigOptions> = {}) =>
  createPayloadConfig({
    environment: "test",
    collections: ["users"],
    disableAdmin: true,
    disableGraphQL: true,
    logLevel: "silent",
    runMigrations: false,
    poolConfig: {
      max: 2,
    },
    ...options,
  });
