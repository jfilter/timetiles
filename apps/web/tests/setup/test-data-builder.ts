/**
 * Test data builder for integration tests
 * Provides helper methods to create consistent test data.
 * @module
 */

import type { Payload } from "payload";
import type { Where } from "payload";

import type { Catalog, Config, Dataset, PayloadJob, ScheduledImport, User } from "@/payload-types";

export class TestDataBuilder {
  constructor(private readonly payload: Payload) {}

  /**
   * Create a test user with default values.
   */
  async createUser(
    overrides: Partial<{
      email: string;
      password: string;
      role: string;
      trustLevel?: string;
    }> = {}
  ): Promise<User> {
    const timestamp = Date.now();
    const defaults = {
      email: `test-user-${timestamp}@example.com`,
      password: "test123456",
      role: "admin",
      trustLevel: "5", // UNLIMITED for admin by default
    };

    return this.payload.create({
      collection: "users",
      data: {
        ...defaults,
        ...overrides,
        role: (overrides.role ?? defaults.role) as "user" | "admin" | "editor",
        trustLevel: (overrides.trustLevel ?? defaults.trustLevel) as "0" | "1" | "2" | "3" | "4" | "5",
      },
    });
  }

  /**
   * Create a test catalog with default values.
   */
  async createCatalog(
    overrides: Partial<{
      name: string;
      slug: string;
      description?: {
        root: {
          type: string;
          children: {
            type: string;
            version: number;
            [k: string]: unknown;
          }[];
          direction: ("ltr" | "rtl") | null;
          format: "left" | "start" | "center" | "right" | "end" | "justify" | "";
          indent: number;
          version: number;
        };
        [k: string]: unknown;
      } | null;
      isPublic: boolean;
      createdBy?: number | User | null;
    }> = {}
  ): Promise<Catalog> {
    const timestamp = Date.now();
    const defaults = {
      name: `Test Catalog ${timestamp}`,
      slug: `test-catalog-${timestamp}`,
      description: {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              version: 1,
              children: [
                {
                  type: "text",
                  version: 1,
                  text: "Test catalog for integration tests",
                  format: 0,
                },
              ],
            },
          ],
          direction: null,
          format: "" as "left" | "start" | "center" | "right" | "end" | "justify" | "",
          indent: 0,
          version: 1,
        },
      },
      isPublic: false,
    };

    return this.payload.create({
      collection: "catalogs",
      data: {
        ...defaults,
        ...overrides,
      },
    });
  }

  /**
   * Create a test dataset with default values.
   */
  async createDataset(
    overrides: Partial<{
      name: string;
      slug: string;
      catalog: number | Catalog;
      language: string;
      isPublic: boolean;
      idStrategy: {
        type: string;
        duplicateStrategy?: string;
      };
    }> = {}
  ): Promise<Dataset> {
    const timestamp = Date.now();
    const defaults = {
      name: `Test Dataset ${timestamp}`,
      slug: `test-dataset-${timestamp}`,
      language: "eng",
      isPublic: false,
      idStrategy: {
        type: "external" as const,
        duplicateStrategy: "skip" as const,
      },
    };

    const finalData = {
      ...defaults,
      ...overrides,
      catalog: overrides.catalog as number | Catalog,
    };
    // Ensure idStrategy types are correct
    if (finalData.idStrategy) {
      finalData.idStrategy = {
        ...finalData.idStrategy,
        type: finalData.idStrategy.type as "external" | "computed" | "auto" | "hybrid",
        duplicateStrategy: finalData.idStrategy.duplicateStrategy as "skip" | "update" | "create" | undefined,
      };
    }
    return this.payload.create({
      collection: "datasets",
      data: finalData as Omit<Dataset, "id" | "updatedAt" | "createdAt" | "sizes">,
    });
  }

  /**
   * Create a test scheduled import with default values.
   */
  async createScheduledImport(
    overrides: Partial<{
      name: string;
      sourceUrl: string;
      catalog: string | number;
      dataset?: number | Dataset | null;
      createdBy?: number | User | null;
      enabled: boolean;
      webhookEnabled: boolean;
      webhookToken?: string;
      scheduleType?: "frequency" | "cron";
      frequency: string;
      importNameTemplate: string;
      authConfig?: {
        type?: string;
        apiKey?: string;
        apiKeyHeader?: string;
        bearerToken?: string;
        username?: string;
        password?: string;
        customHeaders?: Record<string, string>;
      };
      advancedOptions?: {
        autoApproveSchema?: boolean;
        skipDuplicateChecking?: boolean;
      };
      multiSheetConfig?: {
        enabled?: boolean;
        sheets?: Array<{ sheetIdentifier: string }>;
      };
      retryConfig?: {
        maxRetries?: number;
        retryDelayMs?: number;
      };
      lastStatus?: string;
      lastRun?: Date;
      lastError?: string;
      executionHistory?: Array<{
        executedAt?: string;
        status?: string;
        duration?: number;
      }>;
      statistics?: {
        totalRuns?: number;
        successfulRuns?: number;
        failedRuns?: number;
        averageDuration?: number;
      };
    }> = {}
  ): Promise<ScheduledImport> {
    const timestamp = Date.now();
    const defaults = {
      name: `Test Scheduled Import ${timestamp}`,
      sourceUrl: "https://example.com/test-data.csv",
      enabled: true,
      webhookEnabled: false,
      scheduleType: "frequency" as const,
      frequency: "daily" as const,
      importNameTemplate: "{{name}} - {{date}}",
      authConfig: {
        type: "none" as const,
      },
      advancedOptions: {
        autoApproveSchema: true,
        skipDuplicateChecking: false,
      },
    };

    const finalData = {
      ...defaults,
      ...overrides,
      frequency: (overrides.frequency ?? defaults.frequency) as "hourly" | "daily" | "weekly" | "monthly",
      catalog: overrides.catalog as number | Catalog,
      createdBy: overrides.createdBy,
    };
    // scheduleType is already properly typed from overrides
    // Ensure authConfig type is correct
    if (finalData.authConfig?.type) {
      finalData.authConfig.type = finalData.authConfig.type as "none" | "basic" | "bearer" | "api-key" | "custom";
    }
    return this.payload.create({
      collection: "scheduled-imports",
      data: finalData as Omit<ScheduledImport, "id" | "updatedAt" | "createdAt" | "sizes">,
    });
  }

  /**
   * Create a test import file.
   */
  async createImportFile(
    overrides: Partial<{
      originalName: string;
      catalog: number | Catalog | null;
      dataset?: number | Dataset | null;
      scheduledImport?: string | number;
      status: string;
      fileHash?: string;
      metadata?: Record<string, unknown>;
      file?: string | number;
    }> = {}
  ) {
    const timestamp = Date.now();
    const defaults = {
      originalName: `Test Import File ${timestamp}.csv`,
      status: "pending",
      metadata: {},
    };

    return this.payload.create({
      collection: "import-files",
      data: {
        ...defaults,
        ...overrides,
        status: (overrides.status ?? defaults.status) as "pending" | "parsing" | "processing" | "completed" | "failed",
      },
    });
  }

  /**
   * Create a test event.
   */
  async createEvent(
    overrides: Partial<{
      name: string;
      slug: string;
      startDate: string;
      endDate?: string;
      catalog: string | number;
      dataset?: number | Dataset;
      importFile?: string | number;
    }> = {}
  ) {
    const timestamp = Date.now();
    const defaults = {
      name: `Test Event ${timestamp}`,
      slug: `test-event-${timestamp}`,
      startDate: new Date().toISOString(),
      data: {},
      uniqueId: `event-${timestamp}`,
    };

    return this.payload.create({
      collection: "events",
      data: {
        ...defaults,
        ...overrides,
        dataset: overrides.dataset as number | Dataset,
      },
    });
  }

  /**
   * Create a test job.
   */
  async createJob(
    overrides: Partial<{
      task: string;
      status: string;
      priority?: number;
      input?: Record<string, unknown>;
      output?: Record<string, unknown>;
    }> = {}
  ) {
    const defaults = {
      task: "test-task",
      status: "pending",
      priority: 5,
      input: {},
    };

    return this.payload.create({
      collection: "payload-jobs",
      data: {
        ...defaults,
        ...overrides,
      },
    });
  }

  /**
   * Clean up test data by ID.
   */
  async cleanupById(collection: keyof Config["collections"], id: string | number) {
    try {
      await this.payload.delete({
        collection,
        id,
      });
    } catch {
      // Ignore errors if already deleted
    }
  }

  /**
   * Clean up test data by query.
   */
  async cleanupByQuery(collection: keyof Config["collections"], where: Where) {
    try {
      const items = await this.payload.find({
        collection,
        where,
        limit: 1000,
      });

      for (const item of items.docs) {
        await this.cleanupById(collection, item.id);
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Create a complete test environment with related data.
   */
  async createCompleteTestEnvironment() {
    const user = await this.createUser();
    const catalog = await this.createCatalog({ createdBy: user.id });
    const dataset = await this.createDataset({ catalog: catalog.id });
    const scheduledImport = await this.createScheduledImport({
      catalog: catalog.id,
      dataset: dataset.id,
      createdBy: user.id,
      webhookEnabled: true,
    });

    return {
      user,
      catalog,
      dataset,
      scheduledImport,
      cleanup: async () => {
        await this.cleanupById("scheduled-imports", scheduledImport.id);
        await this.cleanupById("datasets", dataset.id);
        await this.cleanupById("catalogs", catalog.id);
        await this.cleanupById("users", user.id);
      },
    };
  }

  /**
   * Create multiple test items.
   */
  async createMany<T>(count: number, createFn: (index: number) => Promise<T>): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < count; i++) {
      results.push(await createFn(i));
    }
    return results;
  }

  /**
   * Wait for a condition to be true.
   */
  async waitFor(
    condition: () => Promise<boolean>,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<void> {
    const { timeout = 30000, interval = 1000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }

  /**
   * Wait for a job to complete.
   */
  async waitForJob(jobId: string): Promise<PayloadJob> {
    await this.waitFor(async () => {
      const job = await this.payload.findByID({
        collection: "payload-jobs",
        id: jobId,
      });
      return Boolean(job.completedAt) || Boolean(job.hasError);
    });

    return this.payload.findByID({
      collection: "payload-jobs",
      id: jobId,
    });
  }

  /**
   * Mock external data fetch responses.
   */
  mockExternalDataResponse(type: "csv" | "excel" | "json" = "csv") {
    const responses = {
      csv: `id,name,date,location
1,"Test Event 1","2024-01-01","San Francisco, CA"
2,"Test Event 2","2024-01-02","New York, NY"
3,"Test Event 3","2024-01-03","Los Angeles, CA"`,
      excel: Buffer.from("Mock Excel Content"),
      json: JSON.stringify([
        { id: 1, name: "Test Event 1", date: "2024-01-01", location: "San Francisco, CA" },
        { id: 2, name: "Test Event 2", date: "2024-01-02", location: "New York, NY" },
        { id: 3, name: "Test Event 3", date: "2024-01-03", location: "Los Angeles, CA" },
      ]),
    };

    const mimeTypes = {
      csv: "text/csv",
      excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      json: "application/json",
    };

    const content = responses[type];
    const mimeType = mimeTypes[type];

    return {
      ok: true,
      status: 200,
      headers: new Map([
        ["content-type", mimeType],
        ["content-length", content.length.toString()],
      ]),
      arrayBuffer: () => (typeof content === "string" ? Buffer.from(content) : content),
      text: () => (typeof content === "string" ? content : content.toString()),
      json: () => (type === "json" ? JSON.parse(content as string) : null),
    };
  }
}
