/**
 * Integration Test Environment Builder.
 *
 * Provides per-worker PostgreSQL databases with Payload CMS initialization
 * and comprehensive test data helpers. Uses `isolate: false` — multiple test
 * files share the same fork process, Payload singleton, and database.
 *
 * DO NOT use this for unit tests. Unit tests should:
 * - Mock payload objects directly (vi.fn())
 * - Use test data factories from tests/setup/factories.ts
 * - Use renderWithProviders for React components
 *
 * @see tests/integration/services/comprehensive-file-upload.test.ts for usage examples
 * @see tests/unit/jobs/schema-detection-job.test.ts for correct unit test patterns
 *
 * @module
 * @category Test Setup
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";

import type { Payload } from "payload";
import { getPayload } from "payload";

import type { CollectionName } from "@/lib/config/payload-config-factory";
import { createTestConfig } from "@/lib/config/payload-config-factory";
import { COLLECTIONS } from "@/lib/config/payload-shared-config";
import { createLogger } from "@/lib/logger";
import { SeedManager } from "@/lib/seed/index";
import type { IngestJob } from "@/payload-types";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import { createTestDatabase } from "./database";
import { TestServer } from "./http-server";

const logger = createLogger("test-env");

/**
 * Create a user without sending a verification email.
 * Payload's `disableVerificationEmail` option is valid at runtime but not in the strict create type overloads.
 */
const createUserWithoutVerification = (payload: Payload, data: Record<string, unknown>): Promise<any> =>
  // @ts-expect-error -- Payload's create() union requires `draft` when versioning is enabled; data is loosely typed from test helpers
  payload.create({ collection: "users", data, disableVerificationEmail: true });

interface SharedWorkerEnvironment {
  payload: Payload;
  seedManager: SeedManager;
  connection: any;
  dbName: string;
  dbUrl: string;
  uploadDir: string;
}

let sharedWorkerEnvironmentPromise: Promise<SharedWorkerEnvironment> | null = null;
let sharedWorkerEnvironmentDbUrl: string | null = null;
const defaultImportUserCache = new WeakMap<object, { id: string | number }>();

export interface TestEnvironmentOptions {
  /** Collections to include in the test environment */
  collections?: CollectionName[];
  /** Whether to create a temporary directory */
  createTempDir?: boolean;
  /**
   * Whether to reset the worker database before creating the environment.
   * Disable this for suites that already truncate in beforeEach.
   */
  resetDatabase?: boolean;
}

export interface TestEnvironment {
  /** Payload instance for this test environment */
  payload: Payload;
  /** SeedManager instance configured for this environment */
  seedManager: SeedManager;
  /** Database connection info */
  connection: any;
  /** Database name */
  dbName: string;
  /** Temporary directory path (if created) */
  tempDir?: string;
  /** Upload directory for import files (always created for integration tests) */
  uploadDir: string;
  /** Cleanup function to call when done */
  cleanup: () => Promise<void>;
  /** Get collection count helper */
  getCollectionCount: (collection: string) => Promise<number>;
  /** Truncate specific collections helper */
  truncateCollections: (collections: string[]) => Promise<void>;
}

export interface RunIngestJobsOptions {
  /** Maximum number of queue drain iterations */
  maxIterations?: number;
  /** Delay between iterations in milliseconds */
  delayMs?: number;
  /** Job queue batch limit */
  queueLimit?: number;
  /** Optional callback for incomplete iterations */
  onPending?: (context: { iteration: number; ingestFile: any }) => Promise<void> | void;
}

export interface RunIngestJobsResult {
  settled: boolean;
  iterations: number;
  ingestFile: any;
}

export interface RunIngestJobStageOptions {
  /** Maximum number of queue drain iterations */
  maxIterations?: number;
  /** Delay between iterations in milliseconds */
  delayMs?: number;
  /** Job queue batch limit */
  queueLimit?: number;
  /** Optional callback for incomplete iterations */
  onPending?: (context: { iteration: number; ingestJob: IngestJob | null }) => Promise<void> | void;
}

export interface RunIngestJobStageResult {
  matched: boolean;
  iterations: number;
  ingestJob: IngestJob | null;
}

export const IMPORT_PIPELINE_COLLECTIONS_TO_RESET = [
  "events",
  "ingest-files",
  "ingest-jobs",
  "datasets",
  "dataset-schemas",
  "payload-jobs",
  "user-usage",
];

const wait = async (delayMs: number): Promise<void> => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const createSeedManager = async (payload: Payload): Promise<SeedManager> => {
  const seedManager = new SeedManager();

  seedManager.initialize = async () => {
    (seedManager as any).payload = payload;

    const { RelationshipResolver } = await import("../../../lib/seed/relationship-resolver");
    (seedManager as any).relationshipResolver = new RelationshipResolver(payload);

    const { DatabaseOperations } = await import("../../../lib/seed/database-operations");
    (seedManager as any).databaseOperations = new DatabaseOperations(payload);

    return payload;
  };

  await seedManager.initialize();
  return seedManager;
};

const getOrCreateDefaultImportUser = async (testEnv: TestEnvironment): Promise<any> => {
  const cacheKey = testEnv.payload as object;
  const workerId = process.env.VITEST_WORKER_ID ?? "1";
  const cachedUser = defaultImportUserCache.get(cacheKey);

  if (cachedUser) {
    try {
      return await testEnv.payload.findByID({ collection: "users", id: cachedUser.id });
    } catch {
      // User was likely removed by a test reset. Fall through and recreate it.
    }
  }

  const user = await createUserWithoutVerification(testEnv.payload, {
    email: `import-test-default-${workerId}-${randomUUID()}@test.local`,
    password: TEST_CREDENTIALS.basic.strongPassword,
    role: "user",
  });

  defaultImportUserCache.set(cacheKey, { id: user.id });

  return user;
};

export class TestEnvironmentBuilder {
  private static readonly activeEnvironments = new Set<TestEnvironment>();

  private static async createSharedWorkerEnvironment(
    dbUrl: string,
    dbName: string,
    collections: CollectionName[],
    workerId: string
  ): Promise<{ environment: SharedWorkerEnvironment; created: boolean }> {
    if (sharedWorkerEnvironmentPromise && sharedWorkerEnvironmentDbUrl === dbUrl) {
      return { environment: await sharedWorkerEnvironmentPromise, created: false };
    }

    logger.info("Creating shared worker test environment", { dbName, workerId, collections: collections.length });

    const loadEnvironment = async (): Promise<SharedWorkerEnvironment> => {
      // The global setup already clones a worker database. This remains as a fallback
      // for direct test execution paths that bypass the Vitest worker setup.
      await createTestDatabase(dbName);

      const uploadDir = `${process.env.UPLOAD_DIR!}/ingest-files`;

      logger.info("Creating test config", { dbName });
      const testConfig = await createTestConfig({
        databaseUrl: dbUrl,
        collections,
        logLevel: (process.env.LOG_LEVEL as "silent" | "error" | "warn" | "info" | "debug") ?? "warn",
      });
      logger.info("Test config created", { dbName });

      logger.info("Getting Payload instance", { dbName, workerId });
      const payload = await getPayload({ config: testConfig });

      const seedManager = await createSeedManager(payload);
      const db = payload.db as { pool?: unknown; drizzle?: unknown; _id?: string };
      const environment: SharedWorkerEnvironment = {
        payload,
        seedManager,
        connection: payload.db,
        dbName,
        dbUrl,
        uploadDir,
      };

      logger.info("Shared worker environment ready", {
        dbName,
        workerId,
        poolState: db?.pool ? "active" : "no-pool",
        drizzleState: db?.drizzle ? "active" : "no-drizzle",
        payloadId: db?._id ?? "no-id",
      });

      return environment;
    };

    sharedWorkerEnvironmentDbUrl = dbUrl;
    let thisPromise: Promise<SharedWorkerEnvironment> | null = null;
    thisPromise = (async () => {
      try {
        return await loadEnvironment();
      } catch (error) {
        if (sharedWorkerEnvironmentPromise === thisPromise) {
          sharedWorkerEnvironmentPromise = null;
          sharedWorkerEnvironmentDbUrl = null;
        }
        throw error;
      }
    })();
    sharedWorkerEnvironmentPromise = thisPromise;

    return { environment: await thisPromise, created: true };
  }

  private static async resetSharedWorkerDatabase(environment: SharedWorkerEnvironment): Promise<void> {
    logger.info("Resetting shared worker database", { dbName: environment.dbName });
    await environment.seedManager.truncate();
  }

  /**
   * Create a new test environment with the specified options.
   */
  async createTestEnvironment(options: TestEnvironmentOptions = {}): Promise<TestEnvironment> {
    const {
      collections = ["events", "catalogs", "datasets", "users"] as CollectionName[],
      createTempDir = true,
      resetDatabase = true,
    } = options;

    logger.info("Creating test environment", { collections, resetDatabase });

    // Generate unique identifiers for temp directories only
    const testId = randomUUID();
    const workerId = process.env.VITEST_WORKER_ID ?? "1";

    // Create temporary directory if requested
    let tempDir: string | undefined;
    if (createTempDir) {
      tempDir = `/tmp/timetiles-test-${workerId}-${testId}`;
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    }

    // Use the same database URL that was set up in the global setup
    // Or get test database URL for this worker
    const { getTestDatabaseUrl, parseDatabaseUrl } = await import("../../../lib/database/url");
    const dbUrl = process.env.DATABASE_URL ?? getTestDatabaseUrl();
    const dbName = parseDatabaseUrl(dbUrl).database;

    logger.debug("Initializing test database", { workerId, dbName, collections: collections.length });

    // Upload directory is already configured in global-setup.ts
    // Just ensure it exists for this test run
    const uploadDir = `${process.env.UPLOAD_DIR!}/ingest-files`;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const { environment, created } = await TestEnvironmentBuilder.createSharedWorkerEnvironment(
      dbUrl,
      dbName,
      collections,
      workerId
    );

    if (resetDatabase && !created && TestEnvironmentBuilder.activeEnvironments.size === 0) {
      await TestEnvironmentBuilder.resetSharedWorkerDatabase(environment);
    } else if (resetDatabase && !created && TestEnvironmentBuilder.activeEnvironments.size > 0) {
      logger.warn("Skipping automatic database reset because another test environment is still active", {
        dbName,
        activeEnvironments: TestEnvironmentBuilder.activeEnvironments.size,
      });
    }

    // Create test environment
    const testEnv: TestEnvironment = {
      payload: environment.payload,
      seedManager: environment.seedManager,
      connection: environment.connection,
      dbName: environment.dbName,
      tempDir,
      uploadDir: environment.uploadDir,
      cleanup: () => this.cleanup(testEnv),
      getCollectionCount: (collection: string) => environment.seedManager.getCollectionCount(collection),
      truncateCollections: (colls: string[]) => environment.seedManager.truncate(colls),
    };

    // Track active environment for cleanup
    TestEnvironmentBuilder.activeEnvironments.add(testEnv);

    logger.info("Test environment created successfully", { workerId, tempDir: tempDir ? "created" : "none" });

    return testEnv;
  }

  /**
   * Create a full integration test environment.
   */
  async createIntegrationTestEnvironment(options: TestEnvironmentOptions = {}): Promise<TestEnvironment> {
    return this.createTestEnvironment({
      collections: Object.keys(COLLECTIONS) as CollectionName[],
      createTempDir: false,
      resetDatabase: false,
      ...options,
    });
  }

  /**
   * Clean up all active test environments.
   */
  static async cleanupAll(): Promise<void> {
    logger.info(`Cleaning up ${TestEnvironmentBuilder.activeEnvironments.size} active test environments`);

    const cleanupPromises = Array.from(TestEnvironmentBuilder.activeEnvironments).map(async (env) => {
      try {
        await env.cleanup();
      } catch (error) {
        logger.warn("Failed to cleanup test environment", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.all(cleanupPromises);
    TestEnvironmentBuilder.activeEnvironments.clear();

    logger.info("All test environments cleaned up");
  }

  /**
   * Cleanup test environment.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Intentionally sync, but kept async for interface compatibility
  private async cleanup(testEnv: TestEnvironment): Promise<void> {
    const workerId = process.env.VITEST_WORKER_ID ?? "unknown";
    logger.info("Cleaning up test environment", { dbName: testEnv.dbName, workerId });

    try {
      // Remove from active environments
      TestEnvironmentBuilder.activeEnvironments.delete(testEnv);

      // Payload cleanup handled automatically by getPayload({ config })

      // Clean up temporary directory
      if (testEnv.tempDir && fs.existsSync(testEnv.tempDir)) {
        fs.rmSync(testEnv.tempDir, { recursive: true, force: true });
      }

      // NOTE: Upload directory is shared across all tests in this worker
      // Don't delete it here - it will be cleaned up in global-setup.ts afterAll

      // IMPORTANT: Do NOT close the Payload connection pool here!
      // Payload's getPayload() returns a cached singleton instance. If we close the pool,
      // subsequent test files in the same worker will get the SAME Payload instance but
      // with a closed pool, causing all database operations to fail with
      // "ValidationError: The following field is invalid: User" or similar errors.
      //
      // The pool will be cleaned up automatically when the worker process exits.
      // Each worker has its own isolated database (timetiles_test_1, etc.) so there's
      // no cross-worker contamination.

      // NOTE: We do NOT truncate tables here in final cleanup because:
      // 1. Worker environments reuse a shared database connection for speed
      // 2. Truncating here with active Payload connections causes deadlocks
      // 3. Suites that need a clean slate either reset on create or truncate in beforeEach

      logger.debug("Test environment cleanup completed", { dbName: testEnv.dbName });
    } catch (error) {
      logger.warn("Error during test environment cleanup", { error: (error as any).message, dbName: testEnv.dbName });
    }
  }
}

/**
 * Create a full integration test environment.
 *
 * This is the standard way to set up integration tests. It provides:
 * - Per-worker PostgreSQL database (shared across test files in the same fork)
 * - Cached Payload CMS singleton with all collections
 * - Optional temp directory for file operations
 * - Automatic cleanup after tests (does NOT close Payload connection)
 *
 * DO NOT use this for unit tests. Unit tests should:
 * - Mock payload objects: `const mockPayload = { findByID: vi.fn(), ... }`
 * - Use test data factories: `import { createEvent } from "@/tests/setup/factories"`
 * - Test logic, not infrastructure
 *
 * @returns Test environment with full database and Payload setup
 *
 * @example
 * ```typescript
 * // Integration test
 * let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
 *
 * beforeAll(async () => {
 *   testEnv = await createIntegrationTestEnvironment();
 * });
 *
 * afterAll(async () => {
 *   await testEnv.cleanup();
 * });
 *
 * beforeEach(async () => {
 *   await testEnv.seedManager.truncate(); // Clear data between tests
 * });
 *
 * it("should process import file", async () => {
 *   const { catalog } = await withCatalog(testEnv, { user: testUser });
 *   // Test with real database...
 * });
 * ```
 *
 * @see tests/integration/services/comprehensive-file-upload.test.ts for complete example
 * @see tests/unit/jobs/schema-detection-job.test.ts for unit test patterns (no database)
 */
export const createIntegrationTestEnvironment = async (
  options: TestEnvironmentOptions = {}
): Promise<TestEnvironment> => {
  // Database setup is handled by the global setup in integration.ts
  // No need to check here as it causes a race condition
  const builder = new TestEnvironmentBuilder();
  return builder.createIntegrationTestEnvironment(options);
};

export const runJobsUntilImportSettled = async (
  payload: Payload,
  ingestFileId: string | number,
  options: RunIngestJobsOptions = {}
): Promise<RunIngestJobsResult> => {
  const { maxIterations = 50, delayMs = 0, queueLimit = 100, onPending } = options;

  let ingestFile: any = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    await payload.jobs.run({ allQueues: true, limit: queueLimit });

    ingestFile = await payload.findByID({ collection: "ingest-files", id: ingestFileId });

    const settled = ingestFile.status === "completed" || ingestFile.status === "failed";
    if (settled) {
      return { settled: true, iterations: iteration, ingestFile };
    }

    if (onPending) {
      await onPending({ iteration, ingestFile });
    }

    await wait(delayMs);
  }

  return { settled: false, iterations: maxIterations, ingestFile };
};

export const runJobsUntilIngestJobStage = async (
  payload: Payload,
  ingestFileId: string | number,
  isDone: (ingestJob: IngestJob) => boolean,
  options: RunIngestJobStageOptions = {}
): Promise<RunIngestJobStageResult> => {
  const { maxIterations = 50, delayMs = 0, queueLimit = 100, onPending } = options;

  let ingestJob: IngestJob | null = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    await payload.jobs.run({ allQueues: true, limit: queueLimit });

    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFileId } },
      overrideAccess: true,
    });

    ingestJob = importJobs.docs[0] ?? null;
    if (ingestJob && isDone(ingestJob)) {
      return { matched: true, iterations: iteration, ingestJob };
    }

    if (onPending) {
      await onPending({ iteration, ingestJob });
    }

    await wait(delayMs);
  }

  return { matched: false, iterations: maxIterations, ingestJob };
};

export const runJobsUntilIngestJobExists = async (
  payload: Payload,
  ingestFileId: string | number,
  options: RunIngestJobStageOptions = {}
): Promise<RunIngestJobStageResult> => runJobsUntilIngestJobStage(payload, ingestFileId, () => true, options);

/**
 * Create a test catalog with smart defaults.
 *
 * A user is required so that catalogs always have a proper `createdBy` owner,
 * which is needed for ingest-file ownership validation.
 *
 * @example
 * ```typescript
 * const { catalog } = await withCatalog(testEnv, { user: testUser });
 * ```
 */
export const withCatalog = async (
  testEnv: TestEnvironment,
  options: { name?: string; slug?: string; description?: string; isPublic?: boolean; user: any }
): Promise<TestEnvironment & { catalog: any }> => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  const catalog = await testEnv.payload.create({
    collection: "catalogs",
    data: {
      name: options.name ?? `Test Catalog ${timestamp}`,
      slug: options.slug ?? `test-catalog-${timestamp}-${randomSuffix}`,
      description: options.description ?? ("Test catalog" as any),
      isPublic: options.isPublic ?? false,
    },
    user: options.user,
  });

  return { ...testEnv, catalog };
};

/**
 * Create a test dataset with smart defaults.
 *
 * @example
 * ```typescript
 * const { dataset } = await withDataset(testEnv, catalogId);
 * const lockedDataset = await withDataset(testEnv, catalogId, {
 *   schemaConfig: { locked: true }
 * });
 * ```
 */
export const withDataset = async (
  testEnv: TestEnvironment,
  catalogId: string | number,
  options?: {
    name?: string;
    slug?: string;
    language?: string;
    schemaConfig?: {
      locked?: boolean;
      autoGrow?: boolean;
      strictValidation?: boolean;
      autoApproveNonBreaking?: boolean;
      allowTransformations?: boolean;
      maxSchemaDepth?: number;
    };
    currentSchema?: any;
    isPublic?: boolean;
    idStrategy?: { type?: string; externalIdPath?: string; duplicateStrategy?: string };
    description?: any;
    ingestTransforms?: any[];
  }
): Promise<TestEnvironment & { dataset: any }> => {
  const timestamp = Date.now();

  const dataset = await testEnv.payload.create({
    collection: "datasets",
    data: {
      name: options?.name ?? `Test Dataset ${timestamp}`,
      slug: options?.slug ?? `test-dataset-${timestamp}`,
      catalog: catalogId as number,
      language: options?.language ?? "eng",
      schemaConfig: options?.schemaConfig ?? { locked: false, autoGrow: true },
      isPublic: options?.isPublic ?? false,
      idStrategy: options?.idStrategy as any,
      description: options?.description,
      ingestTransforms: options?.ingestTransforms,
    },
  });

  return { ...testEnv, dataset };
};

/**
 * User configuration options for withUsers helper.
 */
export interface UserConfig {
  role?: "admin" | "editor" | "user";
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  trustLevel?: string;
  /** Per-user quota overrides (applied via customQuotas field) */
  customQuotas?: {
    maxFileUploadsPerDay?: number;
    maxUrlFetchesPerDay?: number;
    maxActiveSchedules?: number;
    maxEventsPerImport?: number;
    maxTotalEvents?: number;
    maxIngestJobsPerDay?: number;
    maxFileSizeMB?: number;
    maxCatalogsPerUser?: number;
    maxScraperRepos?: number;
    maxScraperRunsPerDay?: number;
  };
  isActive?: boolean;
  _verified?: boolean;
}

type UserRole = "admin" | "editor" | "user";

/**
 * Create a set of test users with specified roles or custom configurations.
 *
 * Supports two usage patterns:
 * 1. Simple array of roles - creates users with default settings
 * 2. Object with custom configurations - full control over user properties
 *
 * All users are created with `disableVerificationEmail: true` to prevent
 * email sending during tests.
 *
 * @example
 * ```typescript
 * // Simple: Create users by role (uses role name as key)
 * const { users } = await withUsers(testEnv, ['admin', 'editor', 'user']);
 * const adminUser = users.admin;
 * const editorUser = users.editor;
 *
 * // Custom: Create users with specific configurations
 * const { users } = await withUsers(testEnv, {
 *   limitedUser: {
 *     role: 'user',
 *     trustLevel: '1',
 *     customQuotas: { maxFileUploadsPerDay: 2, maxEventsPerImport: 100 }
 *   },
 *   superAdmin: {
 *     role: 'admin',
 *     trustLevel: '5',
 *     email: 'super@test.com'
 *   }
 * });
 * const limited = users.limitedUser;
 * const admin = users.superAdmin;
 * ```
 */
export const withUsers = async (
  testEnv: TestEnvironment,
  rolesOrConfigs: UserRole[] | Record<string, UserConfig>
): Promise<TestEnvironment & { users: Record<string, any> }> => {
  const users: Record<string, any> = {};
  const timestamp = Date.now();

  // Handle simple array of roles
  if (Array.isArray(rolesOrConfigs)) {
    for (const role of rolesOrConfigs) {
      const user = await createUserWithoutVerification(testEnv.payload, {
        email: `${role}-${timestamp}@test.com`,
        password: TEST_CREDENTIALS.basic.strongPassword,
        role: role,
      });
      users[role] = user;
    }
  } else {
    // Handle object with custom configurations
    for (const [key, config] of Object.entries(rolesOrConfigs)) {
      const userData: Record<string, any> = {
        email: config.email ?? `${key}-${timestamp}@test.com`,
        password: config.password ?? TEST_CREDENTIALS.basic.strongPassword,
        role: config.role ?? "user",
      };

      // Add optional fields if provided
      if (config.firstName !== undefined) userData.firstName = config.firstName;
      if (config.lastName !== undefined) userData.lastName = config.lastName;
      if (config.trustLevel !== undefined) userData.trustLevel = config.trustLevel;
      if (config.customQuotas !== undefined) userData.customQuotas = config.customQuotas;
      if (config.isActive !== undefined) userData.isActive = config.isActive;
      if (config._verified !== undefined) userData._verified = config._verified;

      const user = await createUserWithoutVerification(testEnv.payload, userData);
      users[key] = user;
    }
  }

  return { ...testEnv, users };
};

/**
 * Create a dataset schema version with smart defaults.
 *
 * @param testEnv - Test environment with payload instance
 * @param datasetId - Dataset ID to associate with the schema
 * @param options - Optional configuration
 * @param options.versionNumber - Schema version number (default: 1)
 * @param options.status - Schema status: "draft" or "published" (default: "draft")
 * @param options.schemaProperties - Schema properties object
 * @param options.required - Required field names
 * @param options.newFields - New field names (auto-generates fieldMetadata and schemaSummary)
 * @param options.removedFields - Removed field names
 * @param options.typeChanges - Type change descriptions
 * @param options.ingestJob - Import job ID that triggered this schema
 * @param options.approvalRequired - Whether approval is required (default: true for draft)
 * @param options.autoApproved - Whether auto-approved (default: false)
 * @param options.approvedBy - User ID who approved (for published schemas)
 * @param options.approvalNotes - Approval notes
 *
 * @example
 * ```typescript
 * // Create draft schema with new field
 * const { schema } = await withSchemaVersion(testEnv, datasetId, {
 *   versionNumber: 2,
 *   status: "draft",
 *   schemaProperties: {
 *     id: { type: "string" },
 *     title: { type: "string" },
 *     category: { type: "string" } // new field
 *   },
 *   required: ["id", "title"],
 *   newFields: ["category"]
 * });
 *
 * // Create published schema
 * const { schema } = await withSchemaVersion(testEnv, datasetId, {
 *   versionNumber: 1,
 *   status: "published",
 *   schemaProperties: {
 *     id: { type: "string" },
 *     title: { type: "string" }
 *   },
 *   approvedBy: adminUser.id,
 *   approvalNotes: "Initial schema"
 * });
 * ```
 */
// Helper to generate field metadata for schema
const generateFieldMetadata = (schemaProperties: Record<string, any>, newFields: string[]) => {
  const fieldMetadata: Record<string, any> = {};
  Object.keys(schemaProperties).forEach((fieldName) => {
    fieldMetadata[fieldName] = {
      occurrences: newFields.includes(fieldName) ? 80 : 100,
      occurrencePercent: newFields.includes(fieldName) ? 80 : 100,
    };
  });
  return fieldMetadata;
};

// Helper to add approval fields based on status
const addApprovalFields = (
  data: Record<string, any>,
  status: "draft" | "published",
  options: { approvalRequired?: boolean; autoApproved?: boolean; approvedBy?: string | number; approvalNotes?: string }
) => {
  if (status === "draft") {
    data.approvalRequired = options.approvalRequired ?? true;
    data.autoApproved = options.autoApproved ?? false;
  } else if (status === "published") {
    if (options.approvedBy !== undefined) {
      data.approvedBy = options.approvedBy;
    }
    if (options.approvalNotes !== undefined) {
      data.approvalNotes = options.approvalNotes;
    }
  }
};

export const withSchemaVersion = async (
  testEnv: TestEnvironment,
  datasetId: string | number,
  options?: {
    versionNumber?: number;
    status?: "draft" | "published";
    schemaProperties?: Record<string, any>;
    required?: string[];
    newFields?: string[];
    removedFields?: string[];
    typeChanges?: Array<{ path: string; oldType: string; newType: string }>;
    ingestJob?: string | number;
    approvalRequired?: boolean;
    autoApproved?: boolean;
    approvedBy?: string | number;
    approvalNotes?: string;
  }
): Promise<TestEnvironment & { schema: any }> => {
  const versionNumber = options?.versionNumber ?? 1;
  const status = options?.status ?? "draft";
  const schemaProperties = options?.schemaProperties ?? {
    id: { type: "string" },
    title: { type: "string" },
    date: { type: "string", format: "date" },
  };
  const required = options?.required ?? ["id", "title", "date"];
  const newFields = options?.newFields ?? [];
  const removedFields = options?.removedFields ?? [];
  const typeChanges = options?.typeChanges ?? [];

  // Generate field metadata
  const fieldMetadata = generateFieldMetadata(schemaProperties, newFields);

  // Build data object
  const data: Record<string, any> = {
    dataset: datasetId,
    versionNumber,
    _status: status,
    schema: { type: "object", properties: schemaProperties, required },
    fieldMetadata,
    schemaSummary: {
      totalFields: Object.keys(schemaProperties).length,
      newFields: newFields.map((path) => ({ path })),
      removedFields: removedFields.map((path) => ({ path })),
      typeChanges,
      enumChanges: [],
    },
  };

  // Add import source if provided
  if (options?.ingestJob !== undefined) {
    data.ingestSources = [{ ingestJob: options.ingestJob, recordCount: 100, batchCount: 1 }];
  }

  // Add approval fields
  addApprovalFields(data, status, options ?? {});

  // @ts-expect-error -- data is dynamically constructed from test options
  const schema = await testEnv.payload.create({ collection: "dataset-schemas", data });

  return { ...testEnv, schema };
};

/**
 * Create and configure test HTTP server with automatic cleanup.
 *
 * @example
 * ```typescript
 * const { testServer, testServerUrl } = await withTestServer(testEnv);
 * testServer.respondWithCSV("/data.csv", "id,name\n1,test");
 * // testServer is automatically cleaned up with testEnv.cleanup()
 * ```
 */
export const withTestServer = async (
  testEnv: TestEnvironment
): Promise<TestEnvironment & { testServer: TestServer; testServerUrl: string }> => {
  const testServer = new TestServer();
  const testServerUrl = await testServer.start();

  // Extend cleanup to stop test server
  const originalCleanup = testEnv.cleanup;
  testEnv.cleanup = async () => {
    await testServer.stop();
    await originalCleanup();
  };

  return { ...testEnv, testServer, testServerUrl };
};

/**
 * Helper function to create import file with upload for testing.
 * Internal helper - not exported.
 */
const createIngestFileWithUpload = async (
  payload: Payload,
  data: any,
  fileContent: string | Buffer,
  fileName: string,
  mimeType: string,
  user?: any,
  triggerWorkflow = false
) => {
  // Convert to Buffer (Payload expects Buffer for file uploads).
  // Avoid unnecessary copies — pass Buffer directly if already a Buffer.
  let data_buf: Buffer;
  if (typeof fileContent === "string") {
    data_buf = Buffer.from(fileContent, "utf8");
  } else if (Buffer.isBuffer(fileContent)) {
    data_buf = fileContent;
  } else {
    data_buf = Buffer.from(fileContent);
  }

  const file = { data: data_buf, mimetype: mimeType, name: fileName, size: data_buf.length };

  // If user is provided, pass it to make req.user available in hooks
  // Otherwise use overrideAccess to bypass authentication requirements
  //
  // By default, skip the afterChange hook that queues manual-ingest workflows.
  // Tests that need the full pipeline should pass triggerWorkflow: true and
  // drain jobs with payload.jobs.run() or runJobsUntilImportSettled().
  return payload.create({
    collection: "ingest-files",
    data,
    file,
    user,
    overrideAccess: !user, // Only override when no user is provided
    context: triggerWorkflow ? {} : { skipIngestFileHooks: true },
  });
};

/**
 * Create an import file with uploaded content.
 *
 * @param testEnv - Test environment with payload instance
 * @param catalogId - Catalog ID to associate with the import (can be null for tests without catalog)
 * @param csvContent - File content as string or Buffer
 * @param options - Optional configuration
 * @param options.filename - Custom filename (default: auto-generated)
 * @param options.mimeType - MIME type (default: "text/csv")
 * @param options.status - Import status (default: "pending")
 * @param options.user - User ID to associate with the import (auto-creates or reuses a shared test user if not provided)
 * @param options.datasetsCount - Number of datasets (for state tracking)
 * @param options.datasetsProcessed - Number of datasets processed
 * @param options.additionalData - Any additional fields to include in the import file data
 *
 * @example
 * ```typescript
 * // Basic usage (auto-creates or reuses a shared test user)
 * const csvContent = "title,date\\nTest Event,2024-01-01";
 * const { ingestFile } = await withIngestFile(testEnv, catalogId, csvContent);
 *
 * // With specific user
 * const { ingestFile } = await withIngestFile(testEnv, catalogId, csvContent, {
 *   filename: "test.csv",
 *   user: userId,
 * });
 * ```
 */
export const withIngestFile = async (
  testEnv: TestEnvironment,
  catalogId: string | number | null,
  csvContent: string | Buffer,
  options?: {
    filename?: string;
    mimeType?: string;
    status?: string;
    user?: string | number;
    datasetsCount?: number;
    datasetsProcessed?: number;
    additionalData?: Record<string, any>;
    /** Set to true to queue the manual-ingest workflow (default: false). Tests using this must drain jobs. */
    triggerWorkflow?: boolean;
  }
): Promise<TestEnvironment & { ingestFile: any }> => {
  // Build data object dynamically based on provided options
  const data: Record<string, any> = { status: options?.status ?? "pending" };

  // Add catalog if provided
  if (catalogId !== null) {
    data.catalog = catalogId;
  }

  // User is required for ingest-files. Create a test user if not provided.
  let userContext: any = undefined;
  if (options?.user === undefined) {
    const defaultUser = await getOrCreateDefaultImportUser(testEnv);
    data.user = defaultUser.id;
    userContext = defaultUser;
  } else {
    data.user = options.user;
    // Try to get the full user object for context
    try {
      userContext = await testEnv.payload.findByID({ collection: "users", id: options.user });
    } catch {
      // User might not exist, just use ID
    }
  }
  if (options?.datasetsCount !== undefined) {
    data.datasetsCount = options.datasetsCount;
  }
  if (options?.datasetsProcessed !== undefined) {
    data.datasetsProcessed = options.datasetsProcessed;
  }

  // Merge any additional data
  if (options?.additionalData) {
    Object.assign(data, options.additionalData);
  }

  const ingestFile = await createIngestFileWithUpload(
    testEnv.payload,
    data,
    csvContent,
    options?.filename ?? `test-import-${Date.now()}.csv`,
    options?.mimeType ?? "text/csv",
    userContext,
    options?.triggerWorkflow ?? false
  );

  return { ...testEnv, ingestFile };
};

/**
 * Create a scheduled ingest with smart defaults.
 *
 * @param testEnv - Test environment with payload instance
 * @param catalogId - Catalog ID to associate with the scheduled ingest
 * @param sourceUrl - URL to fetch data from
 * @param options - Optional configuration
 * @param options.name - Custom name (default: auto-generated)
 * @param options.description - Import description
 * @param options.enabled - Whether the import is enabled (default: true)
 * @param options.scheduleType - Schedule type: "frequency" or "cron" (default: "frequency")
 * @param options.frequency - Frequency: "hourly", "daily", "weekly", "monthly" (for frequency type)
 * @param options.cronExpression - Cron expression (for cron type)
 * @param options.authConfig - Authentication configuration
 * @param options.datasetMapping - Dataset mapping configuration
 * @param options.maxRetries - Maximum retry attempts (default: 3)
 * @param options.retryDelayMinutes - Delay between retries in minutes (default: 5)
 * @param options.timeoutSeconds - Request timeout in seconds (default: 300)
 * @param options.ingestNameTemplate - Template for import file names
 * @param options.user - User to associate with the import
 *
 * @example
 * ```typescript
 * // Basic usage with frequency
 * const { scheduledIngest } = await withScheduledIngest(testEnv, catalogId, sourceUrl);
 *
 * // With cron schedule
 * const { scheduledIngest } = await withScheduledIngest(testEnv, catalogId, sourceUrl, {
 *   scheduleType: "cron",
 *   cronExpression: "0 0 * * *" // Daily at midnight
 * });
 *
 * // With authentication
 * const { scheduledIngest } = await withScheduledIngest(testEnv, catalogId, sourceUrl, {
 *   authConfig: {
 *     type: "api-key",
 *     apiKey: "secret-key",
 *     apiKeyHeader: "X-API-Key"
 *   }
 * });
 * ```
 */
// Helper to add optional fields to data object
const addOptionalFields = (data: Record<string, any>, options: Record<string, any>, fieldNames: string[]) => {
  fieldNames.forEach((fieldName) => {
    if (options[fieldName] !== undefined) {
      data[fieldName] = options[fieldName];
    }
  });
};

export const withScheduledIngest = async (
  testEnv: TestEnvironment,
  catalogId: string | number,
  sourceUrl: string,
  options?: {
    name?: string;
    description?: string;
    enabled?: boolean;
    webhookEnabled?: boolean;
    createdBy?: string | number;
    scheduleType?: "frequency" | "cron";
    frequency?: "hourly" | "daily" | "weekly" | "monthly";
    cronExpression?: string;
    authConfig?: {
      type?: string;
      apiKey?: string;
      apiKeyHeader?: string;
      bearerToken?: string;
      username?: string;
      password?: string;
      customHeaders?: Record<string, any>;
    };
    datasetMapping?: any;
    maxRetries?: number;
    retryDelayMinutes?: number;
    timeoutSeconds?: number;
    ingestNameTemplate?: string;
    additionalData?: Record<string, any>;
    user?: any;
  }
): Promise<TestEnvironment & { scheduledIngest: any }> => {
  const timestamp = Date.now();

  // Build data object with required fields
  const data: Record<string, any> = {
    name: options?.name ?? `Test Import ${timestamp}`,
    sourceUrl,
    enabled: options?.enabled ?? true,
    catalog: catalogId,
    scheduleType: options?.scheduleType ?? "frequency",
  };

  // Add optional fields if provided
  const optionalFields = [
    "description",
    "webhookEnabled",
    "createdBy",
    "frequency",
    "cronExpression",
    "authConfig",
    "datasetMapping",
    "maxRetries",
    "retryDelayMinutes",
    "timeoutSeconds",
    "ingestNameTemplate",
  ];

  addOptionalFields(data, options ?? {}, optionalFields);

  // Merge any additional data
  if (options?.additionalData) {
    Object.assign(data, options.additionalData);
  }

  const scheduledIngest = await testEnv.payload.create({
    collection: "scheduled-ingests",
    data,
    ...(options?.user && { user: options.user }),
  });

  return { ...testEnv, scheduledIngest };
};
