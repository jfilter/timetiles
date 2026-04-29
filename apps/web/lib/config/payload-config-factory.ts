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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { de } from "@payloadcms/translations/languages/de";
import { en } from "@payloadcms/translations/languages/en";
import nodemailer from "nodemailer";
import type { Config, Plugin } from "payload";
import { buildConfig } from "payload";
import sharp from "sharp";

import Users from "@/lib/collections/users";
import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { schemaDetectionPlugin } from "@/lib/services/schema-detection";

import type { CollectionName } from "./payload-shared-config";
import {
  ALL_GLOBALS,
  ALL_JOBS,
  ALL_WORKFLOWS,
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
  poolConfig?: { max?: number; connectionString?: string };

  // Logging configuration
  logLevel?: "debug" | "info" | "warn" | "error" | "fatal" | "silent";

  // Migration configuration
  runMigrations?: boolean;

  // Additional plugins (schema detection is always included)
  plugins?: Plugin[];
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
  const credentials: EtherealCredentials = { user: testAccount.user, pass: testAccount.pass };

  // Cache to file
  try {
    writeFileSync(ETHEREAL_CACHE_FILE, JSON.stringify(credentials, null, 2));
  } catch {
    // Non-fatal, just won't persist
  }

  logger.info(`E-mail: NEW ethereal.email (${credentials.user} / ${credentials.pass}) - https://ethereal.email/login`);

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
    pool: { connectionString: databaseUrl ?? "", max: environment === "test" ? 5 : undefined, ...poolConfig },
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
// oxlint-disable-next-line complexity -- Payload config requires many conditional options
export const buildConfigWithDefaults = async (options: PayloadConfigOptions = {}) => {
  const env = getEnv();
  const {
    environment = env.NODE_ENV,
    databaseUrl = env.DATABASE_URL,
    secret = env.PAYLOAD_SECRET,
    serverURL = env.NEXT_PUBLIC_PAYLOAD_URL,
    disableAdmin = false,
    disableGraphQL = true,
    collections = Object.keys(COLLECTIONS) as CollectionName[],
    poolConfig,
    logLevel,
    runMigrations = true,
    plugins = [],
  } = options;

  // Select collections based on the provided list
  const selectedCollections = (collections ?? []).map((name) => COLLECTIONS[name]).filter(Boolean);

  // Build configuration
  // SECURITY: `secret` originates from `getEnv().PAYLOAD_SECRET`, which Zod-validates
  // at runtime and errors if missing. We intentionally do NOT fall back to a
  // guessable string here — a missing secret must hard-fail, never silently
  // downgrade to a known-public default.
  const config: Config = {
    secret: secret ?? getEnv().PAYLOAD_SECRET,
    i18n: { supportedLanguages: { en, de } },
    localization: {
      locales: [
        { label: "English", code: "en" },
        { label: "Deutsch", code: "de" },
      ],
      defaultLocale: "en",
      fallback: true,
    },
    routes: { admin: "/dashboard" },
    admin: {
      user: collections?.includes("users") ? Users.slug : undefined,
      disable: disableAdmin || environment === "test",
      components: { header: ["/components/admin/admin-header"], providers: ["/components/admin/admin-i18n-provider"] },
    },
    logger: getLogger(logLevel, environment),
    debug: environment === "development",
    collections: selectedCollections,
    globals: ALL_GLOBALS,
    jobs: {
      tasks: ALL_JOBS,
      workflows: ALL_WORKFLOWS,
      enableConcurrencyControl: true,
      jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
        ...defaultJobsCollection,
        admin: {
          ...defaultJobsCollection.admin,
          hidden: false,
          defaultColumns: ["taskSlug", "queue", "processing", "hasError", "totalTried", "updatedAt", "meta"],
        },
      }),
      // In development, auto-run jobs within the Next.js process (no separate worker needed)
      ...(environment === "development"
        ? {
            autoRun: [
              { cron: "*/10 * * * * *", queue: "ingest", limit: 10 },
              { cron: "* * * * *", queue: "default", limit: 10 },
              { cron: "* * * * *", queue: "maintenance", limit: 10 },
            ],
          }
        : {}),
    },
    plugins: [
      // Schema detection plugin (always enabled, provides language-aware field detection)
      schemaDetectionPlugin({ extendDatasets: collections?.includes("datasets") ?? false }),
      ...plugins,
    ],
    editor: lexicalEditor({}),
    typescript: DEFAULT_TYPESCRIPT_CONFIG,
    db: createDbAdapter(databaseUrl, environment, poolConfig, runMigrations),
    graphQL: { disable: disableGraphQL },
    // Sharp's default export type doesn't match Payload's expected sharp type.
    // This is a known Payload CMS issue — both expect the same runtime value.
    sharp: sharp,
  };

  // Configure email adapter
  if (environment === "test") {
    config.email = nodemailerAdapter({
      defaultFromAddress: env.EMAIL_FROM_ADDRESS,
      defaultFromName: env.EMAIL_FROM_NAME,
      // eslint-disable-next-line sonarjs/no-clear-text-protocols -- JSON transport is in-memory and test-only
      transport: nodemailer.createTransport({ jsonTransport: true }),
      skipVerify: true,
    });
  } else if (env.EMAIL_SMTP_HOST) {
    // Production: Use SMTP transport
    config.email = nodemailerAdapter({
      defaultFromAddress: env.EMAIL_FROM_ADDRESS,
      defaultFromName: env.EMAIL_FROM_NAME,
      transportOptions: {
        host: env.EMAIL_SMTP_HOST,
        port: env.EMAIL_SMTP_PORT,
        auth: env.EMAIL_SMTP_USER ? { user: env.EMAIL_SMTP_USER, pass: env.EMAIL_SMTP_PASS } : undefined,
        // When the SMTP host is reached by a private IP but the server cert
        // names a public hostname, override the SNI/cert-validation name.
        ...(env.EMAIL_SMTP_TLS_SERVERNAME ? { tls: { servername: env.EMAIL_SMTP_TLS_SERVERNAME } } : {}),
      },
    });
  } else {
    // Development: Use ethereal.email with cached credentials
    const ethereal = await getEtherealCredentials();
    config.email = nodemailerAdapter({
      defaultFromAddress: env.EMAIL_FROM_ADDRESS,
      defaultFromName: env.EMAIL_FROM_NAME,
      transportOptions: { host: "smtp.ethereal.email", port: 587, auth: { user: ethereal.user, pass: ethereal.pass } },
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
    poolConfig: { max: 5 },
    ...options,
  });
