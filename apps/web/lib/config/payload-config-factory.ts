/**
 * Factory for creating environment-specific Payload CMS configurations.
 *
 * Provides a centralized way to create Payload configurations for different environments
 * (production, test, development) with consistent settings and reduced duplication.
 * Follows Payload's own pattern of using `buildConfigWithDefaults` helper.
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
  DEFAULT_DB_CONFIG,
  DEFAULT_TYPESCRIPT_CONFIG,
  DEFAULT_UPLOAD_CONFIG,
} from "./payload-shared-config";

// Re-export for convenience
export type { CollectionName } from "./payload-shared-config";
export { COLLECTIONS } from "./payload-shared-config";

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

  // Collections to include (defaults to all)
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
}

// Helper to get logger configuration
const getLogger = (logLevel: string | undefined, environment: string) => {
  if (logLevel === "silent" || environment === "test") {
    return { options: { level: "fatal" as const } };
  }
  if (logLevel) {
    return { options: { level: logLevel } };
  }
  return undefined;
};

// Helper to create database adapter
const createDbAdapter = (
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

// Helper to configure production-specific settings
const configureProduction = (config: Config, serverURL: string) => {
  config.serverURL = serverURL;
  config.cors = [serverURL];
  config.csrf = [serverURL];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config.sharp = sharp as any;
  config.upload = DEFAULT_UPLOAD_CONFIG;
};

/**
 * Creates a Payload configuration with the specified options.
 * Simplified factory following Payload's own buildConfigWithDefaults pattern.
 */
export const buildConfigWithDefaults = async (options: PayloadConfigOptions = {}) => {
  const {
    environment = process.env.NODE_ENV ?? "development",
    databaseUrl = process.env.DATABASE_URL,
    secret = process.env.PAYLOAD_SECRET,
    serverURL = process.env.NEXT_PUBLIC_PAYLOAD_URL,
    disableAdmin = false,
    disableGraphQL = true,
    collections = Object.keys(COLLECTIONS) as CollectionName[],
    poolConfig,
    logLevel,
    runMigrations = true,
  } = options;

  // Select collections based on the provided list
  const selectedCollections = (collections ?? []).map((name) => COLLECTIONS[name]).filter(Boolean);

  // Build configuration
  const config: Config = {
    secret: secret ?? "default-secret-key",
    admin: {
      user: collections?.includes("users") ? Users.slug : undefined,
      disable: disableAdmin || environment === "test",
    },
    logger: getLogger(logLevel, environment),
    debug: environment === "development",
    collections: selectedCollections,
    globals: ALL_GLOBALS,
    jobs: {
      tasks: ALL_JOBS,
    },
    editor: lexicalEditor({}),
    typescript: DEFAULT_TYPESCRIPT_CONFIG,
    db: createDbAdapter(databaseUrl, environment, poolConfig, runMigrations),
    graphQL: {
      disable: disableGraphQL,
    },
  };

  // Add production-specific configuration
  if (environment === "production" && serverURL) {
    configureProduction(config, serverURL);
  }

  return buildConfig(config);
};

/**
 * Creates a test Payload configuration with sensible defaults.
 */
export const createTestConfig = async (options: Partial<PayloadConfigOptions> = {}) =>
  buildConfigWithDefaults({
    environment: "test",
    disableAdmin: true,
    disableGraphQL: true,
    logLevel: "silent",
    poolConfig: {
      max: 5,
    },
    ...options,
  });
