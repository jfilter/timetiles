/**
 * Integration Test Environment Builder.
 *
 * Provides full database isolation with PostgreSQL, Payload CMS initialization,
 * migrations, temp directories, and comprehensive test data helpers.
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

import { getPayload } from "payload";

import type { CollectionName } from "@/lib/config/payload-config-factory";
import { createTestConfig } from "@/lib/config/payload-config-factory";
import { createLogger } from "@/lib/logger";
import { SeedManager } from "@/lib/seed/index";
import { RelationshipResolver } from "@/lib/seed/relationship-resolver";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import { createTestDatabase, truncateAllTables } from "./database";
import { TestServer } from "./http-server";

const logger = createLogger("test-env");

export interface TestEnvironmentOptions {
  /** Collections to include in the test environment */
  collections?: CollectionName[];
  /** Whether to seed data automatically */
  seedData?: boolean;
  /** Custom seed data to use instead of defaults */
  customSeedData?: Record<string, any[]>;
  /** Environment type for seeding */
  environment?: "test" | "development";
  /** Whether to create a temporary directory */
  createTempDir?: boolean;
}

export interface TestEnvironment {
  /** Payload instance for this test environment */
  payload: any;
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

export class TestEnvironmentBuilder {
  private static readonly activeEnvironments = new Set<TestEnvironment>();

  /**
   * Create a new test environment with the specified options.
   */
  async createTestEnvironment(options: TestEnvironmentOptions = {}): Promise<TestEnvironment> {
    const {
      collections = ["events", "catalogs", "datasets", "users"] as CollectionName[],
      seedData = false,
      customSeedData = {},
      environment = "test" as const,
      createTempDir = true,
    } = options;

    logger.info("Creating test environment", {
      collections,
      seedData,
    });

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

    logger.debug("Initializing test database", {
      workerId,
      dbName,
      collections: collections.length,
    });

    // Ensure database exists
    logger.info("Creating test database", { dbName });
    await createTestDatabase(dbName);
    logger.info("Database created", { dbName });

    // Clean database state with truncation
    logger.info("Truncating tables", { dbName });
    await truncateAllTables(dbUrl);
    logger.info("Tables truncated", { dbName });

    // Upload directory is already configured in global-setup.ts
    // Just ensure it exists for this test run
    const uploadDir = process.env.UPLOAD_DIR_IMPORT_FILES!;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Create optimized Payload config for testing
    logger.info("Creating test config", { dbName });
    const testConfig = await createTestConfig({
      databaseUrl: dbUrl,
      collections,
      logLevel: (process.env.LOG_LEVEL as any) || "silent",
    });
    logger.info("Test config created", { dbName });

    logger.info("Getting Payload instance", { dbName });
    const payload = await getPayload({ config: testConfig });
    logger.info("Payload instance created", { dbName });

    // prodMigrations automatically runs migrations on initialization
    // No need to call payload.db.migrate() explicitly

    // Create and configure SeedManager
    const seedManager = new SeedManager();
    await this.configureSeedManager(seedManager, payload);

    // Seed data if requested
    if (seedData || Object.keys(customSeedData).length > 0) {
      await this.seedTestData(seedManager, customSeedData, environment, collections);
    }

    // Create test environment
    const testEnv: TestEnvironment = {
      payload,
      seedManager,
      connection: payload.db,
      dbName, // Use the dbName variable from above
      tempDir,
      uploadDir, // Always available for file upload tests
      cleanup: () => this.cleanup(testEnv),
      getCollectionCount: (collection: string) => seedManager.getCollectionCount(collection),
      truncateCollections: (colls: string[]) => seedManager.truncate(colls),
    };

    // Track active environment for cleanup
    TestEnvironmentBuilder.activeEnvironments.add(testEnv);

    logger.info("Test environment created successfully", {
      workerId,
      tempDir: tempDir ? "created" : "none",
      seeded: seedData || Object.keys(customSeedData).length > 0,
    });

    return testEnv;
  }

  /**
   * Create a full integration test environment.
   */
  async createIntegrationTestEnvironment(customData?: Record<string, any[]>): Promise<TestEnvironment> {
    return this.createTestEnvironment({
      collections: [
        "users",
        "media",
        "pages",
        "catalogs",
        "datasets",
        "dataset-schemas",
        "events",
        "import-files",
        "import-jobs",
        "scheduled-imports",
        "geocoding-providers",
        "location-cache",
      ] as CollectionName[],
      seedData: false, // Don't seed automatically to avoid relationship issues
      customSeedData: customData ?? {},
      environment: "test",
      createTempDir: true, // Enable temp directory for file operations
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
   * Configure SeedManager for the test environment.
   */
  private async configureSeedManager(seedManager: SeedManager, payload: any): Promise<void> {
    // Override initialize to use our test payload
    seedManager.initialize = async () => {
      (seedManager as any).payload = payload;
      (seedManager as any).relationshipResolver = new RelationshipResolver(payload);

      // Initialize database operations
      const { DatabaseOperations } = await import("../../../lib/seed/database-operations");
      (seedManager as any).databaseOperations = new DatabaseOperations(payload);

      return payload;
    };

    await seedManager.initialize();
  }

  /**
   * Seed test data using efficient methods.
   */
  private async seedTestData(
    seedManager: SeedManager,
    customData: Record<string, any[]>,
    environment: string,
    collections: string[]
  ): Promise<void> {
    if (Object.keys(customData).length === 0) {
      // Use standard seeding
      await seedManager.seed({
        collections,
        environment: environment as "production" | "development" | "test" | "staging",
        truncate: false, // Already truncated
      });
      return;
    }

    // Use custom seed data
    logger.debug("Seeding custom test data", {
      collections: Object.keys(customData),
    });

    for (const [collection, data] of Object.entries(customData)) {
      if (data.length === 0) continue;

      await this.seedCollectionData(seedManager, collection, data);
    }
  }

  private async seedCollectionData(seedManager: SeedManager, collection: string, data: any[]): Promise<void> {
    // Use the RelationshipResolver to handle relationships
    const resolver = (seedManager as any).relationshipResolver as RelationshipResolver;
    const resolvedData = await resolver.resolveCollectionRelationships(data, collection);

    // Create items efficiently
    for (const item of resolvedData) {
      try {
        await (seedManager as any).payload.create({
          collection,
          data: item,
        });
      } catch (error) {
        logger.warn(`Failed to create ${collection} item`, {
          error: (error as any).message,
        });
      }
    }
  }

  /**
   * Cleanup test environment.
   */
  private async cleanup(testEnv: TestEnvironment): Promise<void> {
    logger.debug("Cleaning up test environment", { dbName: testEnv.dbName });

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

      // Skip seedManager cleanup entirely - it's too slow (10+ seconds)
      // Instead, just close the connection pool directly
      if (testEnv.payload?.db?.pool) {
        try {
          await Promise.race([
            testEnv.payload.db.pool.end(),
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Pool close timeout")), 2000)),
          ]);
        } catch (error) {
          logger.warn("Failed to close pool cleanly", { error: (error as Error).message });
        }
      }

      // NOTE: We do NOT truncate tables here in final cleanup because:
      // 1. Each test file has isolated database (timetiles_test_1, timetiles_test_2, etc.)
      // 2. Truncation in beforeEach is sufficient for test isolation
      // 3. Truncating here with active Payload connections causes deadlocks
      // 4. Tables are truncated in beforeEach anyway for the next test

      logger.debug("Test environment cleanup completed", {
        dbName: testEnv.dbName,
      });
    } catch (error) {
      logger.warn("Error during test environment cleanup", {
        error: (error as any).message,
        dbName: testEnv.dbName,
      });
    }
  }
}

/**
 * Create a full integration test environment with database isolation.
 *
 * This is the standard way to set up integration tests. It provides:
 * - Isolated PostgreSQL database (one per worker)
 * - Full Payload CMS with all collections
 * - Temp directory for file operations
 * - Automatic cleanup after tests
 *
 * DO NOT use this for unit tests. Unit tests should:
 * - Mock payload objects: `const mockPayload = { findByID: vi.fn(), ... }`
 * - Use test data factories: `import { createEvent } from "@/tests/setup/factories"`
 * - Test logic, not infrastructure
 *
 * @param customData - Optional custom seed data for collections
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
 *   const { catalog } = await withCatalog(testEnv);
 *   // Test with real database...
 * });
 * ```
 *
 * @see tests/integration/services/comprehensive-file-upload.test.ts for complete example
 * @see tests/unit/jobs/schema-detection-job.test.ts for unit test patterns (no database)
 */
export const createIntegrationTestEnvironment = async (
  customData?: Record<string, any[]>
): Promise<TestEnvironment> => {
  // Database setup is handled by the global setup in integration.ts
  // No need to check here as it causes a race condition
  const builder = new TestEnvironmentBuilder();
  return builder.createIntegrationTestEnvironment(customData);
};

/**
 * Create a test catalog with smart defaults.
 *
 * @example
 * ```typescript
 * const { catalog } = await withCatalog(testEnv);
 * const customCatalog = await withCatalog(testEnv, { name: "My Catalog" });
 * ```
 */
export const withCatalog = async (
  testEnv: TestEnvironment,
  options?: {
    name?: string;
    slug?: string;
    description?: string;
    editors?: string[];
    isPublic?: boolean;
    user?: any;
  }
): Promise<TestEnvironment & { catalog: any }> => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  const catalog = await testEnv.payload.create({
    collection: "catalogs",
    data: {
      name: options?.name ?? `Test Catalog ${timestamp}`,
      slug: options?.slug ?? `test-catalog-${timestamp}-${randomSuffix}`,
      description: options?.description ?? "Test catalog",
      editors: options?.editors,
      isPublic: options?.isPublic ?? false,
    },
    ...(options?.user && { user: options.user }),
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
    idStrategy?: {
      type?: string;
      duplicateStrategy?: string;
    };
    description?: any;
    importTransforms?: any[];
    typeTransformations?: any[];
  }
): Promise<TestEnvironment & { dataset: any }> => {
  const timestamp = Date.now();

  const dataset = await testEnv.payload.create({
    collection: "datasets",
    data: {
      name: options?.name ?? `Test Dataset ${timestamp}`,
      slug: options?.slug ?? `test-dataset-${timestamp}`,
      catalog: catalogId,
      language: options?.language ?? "eng",
      schemaConfig: options?.schemaConfig ?? {
        locked: false,
        autoGrow: true,
      },
      currentSchema: options?.currentSchema,
      isPublic: options?.isPublic ?? false,
      idStrategy: options?.idStrategy,
      description: options?.description,
      importTransforms: options?.importTransforms,
      typeTransformations: options?.typeTransformations,
    },
  });

  return { ...testEnv, dataset };
};

/**
 * Create a set of test users with specified roles.
 *
 * @example
 * ```typescript
 * const { users } = await withUsers(testEnv, ['admin', 'editor', 'user']);
 * const adminUser = users.admin;
 * const editorUser = users.editor;
 * ```
 */
export const withUsers = async (
  testEnv: TestEnvironment,
  roles: ("admin" | "editor" | "user")[]
): Promise<TestEnvironment & { users: Record<string, any> }> => {
  const users: Record<string, any> = {};

  for (const role of roles) {
    const user = await testEnv.payload.create({
      collection: "users",
      data: {
        email: `${role}@test.com`,
        password: TEST_CREDENTIALS.basic.strongPassword,
        role: role === "user" ? "user" : role,
      },
    });
    users[role] = user;
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
 * @param options.importJob - Import job ID that triggered this schema
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
  options: {
    approvalRequired?: boolean;
    autoApproved?: boolean;
    approvedBy?: string | number;
    approvalNotes?: string;
  }
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
    importJob?: string | number;
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
    schema: {
      type: "object",
      properties: schemaProperties,
      required,
    },
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
  if (options?.importJob !== undefined) {
    data.importSources = [
      {
        import: options.importJob,
        recordCount: 100,
        batchCount: 1,
      },
    ];
  }

  // Add approval fields
  addApprovalFields(data, status, options ?? {});

  const schema = await testEnv.payload.create({
    collection: "dataset-schemas",
    data,
  });

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
const createImportFileWithUpload = async (
  payload: any,
  data: any,
  fileContent: string | Buffer,
  fileName: string,
  mimeType: string
) => {
  // Convert to Uint8Array which is what Payload's file-type checker expects
  const fileBuffer =
    typeof fileContent === "string" ? new Uint8Array(Buffer.from(fileContent, "utf8")) : new Uint8Array(fileContent);

  // Create file object with Uint8Array data
  const file = {
    data: fileBuffer,
    mimetype: mimeType,
    name: fileName,
    size: fileBuffer.length,
  };

  // Use Payload's Local API with file parameter
  return await payload.create({
    collection: "import-files",
    data,
    file,
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
 * @param options.user - User ID to associate with the import
 * @param options.sessionId - Session ID for unauthenticated uploads
 * @param options.datasetsCount - Number of datasets (for state tracking)
 * @param options.datasetsProcessed - Number of datasets processed
 * @param options.additionalData - Any additional fields to include in the import file data
 *
 * @example
 * ```typescript
 * // Basic usage
 * const csvContent = "title,date\\nTest Event,2024-01-01";
 * const { importFile } = await withImportFile(testEnv, catalogId, csvContent);
 *
 * // With user and session
 * const { importFile } = await withImportFile(testEnv, catalogId, csvContent, {
 *   filename: "test.csv",
 *   user: userId,
 *   sessionId: "session-123"
 * });
 *
 * // Without catalog (for edge cases)
 * const { importFile } = await withImportFile(testEnv, null, csvContent, {
 *   sessionId: "session-123"
 * });
 * ```
 */
export const withImportFile = async (
  testEnv: TestEnvironment,
  catalogId: string | number | null,
  csvContent: string | Buffer,
  options?: {
    filename?: string;
    mimeType?: string;
    status?: string;
    user?: string | number;
    sessionId?: string;
    datasetsCount?: number;
    datasetsProcessed?: number;
    additionalData?: Record<string, any>;
  }
): Promise<TestEnvironment & { importFile: any }> => {
  // Build data object dynamically based on provided options
  const data: Record<string, any> = {
    status: options?.status ?? "pending",
  };

  // Add catalog if provided
  if (catalogId !== null) {
    data.catalog = catalogId;
  }

  // Add optional fields if provided
  if (options?.user !== undefined) {
    data.user = options.user;
  }
  if (options?.sessionId !== undefined) {
    data.sessionId = options.sessionId;
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

  const importFile = await createImportFileWithUpload(
    testEnv.payload,
    data,
    csvContent,
    options?.filename ?? `test-import-${Date.now()}.csv`,
    options?.mimeType ?? "text/csv"
  );

  return { ...testEnv, importFile };
};

/**
 * Create a scheduled import with smart defaults.
 *
 * @param testEnv - Test environment with payload instance
 * @param catalogId - Catalog ID to associate with the scheduled import
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
 * @param options.importNameTemplate - Template for import file names
 * @param options.user - User to associate with the import
 *
 * @example
 * ```typescript
 * // Basic usage with frequency
 * const { scheduledImport } = await withScheduledImport(testEnv, catalogId, sourceUrl);
 *
 * // With cron schedule
 * const { scheduledImport } = await withScheduledImport(testEnv, catalogId, sourceUrl, {
 *   scheduleType: "cron",
 *   cronExpression: "0 0 * * *" // Daily at midnight
 * });
 *
 * // With authentication
 * const { scheduledImport } = await withScheduledImport(testEnv, catalogId, sourceUrl, {
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

export const withScheduledImport = async (
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
    importNameTemplate?: string;
    additionalData?: Record<string, any>;
    user?: any;
  }
): Promise<TestEnvironment & { scheduledImport: any }> => {
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
    "importNameTemplate",
  ];

  addOptionalFields(data, options ?? {}, optionalFields);

  // Merge any additional data
  if (options?.additionalData) {
    Object.assign(data, options.additionalData);
  }

  const scheduledImport = await testEnv.payload.create({
    collection: "scheduled-imports",
    data,
    ...(options?.user && { user: options.user }),
  });

  return { ...testEnv, scheduledImport };
};
