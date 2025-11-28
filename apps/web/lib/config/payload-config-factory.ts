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
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { existsSync, readFileSync, writeFileSync } from "fs";
import nodemailer from "nodemailer";
import { join } from "path";
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

// Cache file for ethereal.email credentials (dev only)
const ETHEREAL_CACHE_FILE = join(process.cwd(), ".ethereal-credentials.json");

interface EtherealCredentials {
  user: string;
  pass: string;
}

// Cached credentials in memory (survives hot reloads within same process)
let cachedEtherealCredentials: EtherealCredentials | null = null;

/**
 * Get or create ethereal.email test account credentials.
 * Caches to file so credentials persist across server restarts.
 */
const getEtherealCredentials = async (): Promise<EtherealCredentials> => {
  // Check memory cache first (no race condition - single-threaded init)
  if (cachedEtherealCredentials) {
    return cachedEtherealCredentials;
  }

  // Check file cache
  if (existsSync(ETHEREAL_CACHE_FILE)) {
    try {
      const cached = JSON.parse(readFileSync(ETHEREAL_CACHE_FILE, "utf-8")) as EtherealCredentials;
      if (cached.user && cached.pass) {
        cachedEtherealCredentials = cached;
        return cached;
      }
    } catch {
      // Invalid cache, will create new account
    }
  }

  // Create new ethereal account
  const testAccount = await nodemailer.createTestAccount();
  const credentials: EtherealCredentials = {
    user: testAccount.user,
    pass: testAccount.pass,
  };

  // Cache to file
  try {
    writeFileSync(ETHEREAL_CACHE_FILE, JSON.stringify(credentials, null, 2));
  } catch {
    // Non-fatal, just won't persist
  }

  // eslint-disable-next-line no-console -- Intentional dev output before logger init
  console.log(`E-mail: NEW ethereal.email (${credentials.user} / ${credentials.pass}) - https://ethereal.email/login`);

  // eslint-disable-next-line require-atomic-updates -- Single-threaded init, no race condition
  cachedEtherealCredentials = credentials;
  return credentials;
};

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
  config.upload = DEFAULT_UPLOAD_CONFIG;
};

/**
 * Creates a Payload configuration with the specified options.
 * Simplified factory following Payload's own buildConfigWithDefaults pattern.
 */
// eslint-disable-next-line complexity -- Payload config requires many conditional options
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
    routes: {
      admin: "/dashboard",
    },
    admin: {
      user: collections?.includes("users") ? Users.slug : undefined,
      disable: disableAdmin || environment === "test",
      components: {
        header: ["/components/admin/admin-header"],
      },
    },
    logger: getLogger(logLevel, environment),
    debug: environment === "development",
    collections: selectedCollections,
    globals: ALL_GLOBALS,
    jobs: {
      tasks: ALL_JOBS,
      // In development, run `make jobs` to process jobs every 10s
      // In production, use external cron or Vercel Cron to call /api/payload-jobs/run
    },
    editor: lexicalEditor({}),
    typescript: DEFAULT_TYPESCRIPT_CONFIG,
    db: createDbAdapter(databaseUrl, environment, poolConfig, runMigrations),
    graphQL: {
      disable: disableGraphQL,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sharp: sharp as any,
  };

  // Configure email adapter
  if (process.env.EMAIL_SMTP_HOST) {
    // Production: Use SMTP transport
    config.email = nodemailerAdapter({
      defaultFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "noreply@timetiles.app",
      defaultFromName: process.env.EMAIL_FROM_NAME ?? "TimeTiles",
      transportOptions: {
        host: process.env.EMAIL_SMTP_HOST,
        port: Number(process.env.EMAIL_SMTP_PORT) || 587,
        auth: process.env.EMAIL_SMTP_USER
          ? {
              user: process.env.EMAIL_SMTP_USER,
              pass: process.env.EMAIL_SMTP_PASS,
            }
          : undefined,
      },
    });
  } else {
    // Development: Use ethereal.email with cached credentials
    const ethereal = await getEtherealCredentials();
    config.email = nodemailerAdapter({
      defaultFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "noreply@timetiles.app",
      defaultFromName: process.env.EMAIL_FROM_NAME ?? "TimeTiles",
      transportOptions: {
        host: "smtp.ethereal.email",
        port: 587,
        auth: {
          user: ethereal.user,
          pass: ethereal.pass,
        },
      },
    });
  }

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
