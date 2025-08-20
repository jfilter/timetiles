/**
 * Test data builder for integration tests
 * Provides helper methods to create consistent test data
 * @module
 */

import type { Catalog, Dataset, Payload, ScheduledImport, User } from "@/payload-types";

export class TestDataBuilder {
  constructor(private payload: Payload) {}

  /**
   * Create a test user with default values
   */
  async createUser(overrides: Partial<{
    email: string;
    password: string;
    role: string;
  }> = {}): Promise<User> {
    const timestamp = Date.now();
    const defaults = {
      email: `test-user-${timestamp}@example.com`,
      password: "test123456",
      role: "admin",
    };

    return await this.payload.create({
      collection: "users",
      data: {
        ...defaults,
        ...overrides,
      },
    });
  }

  /**
   * Create a test catalog with default values
   */
  async createCatalog(overrides: Partial<{
    name: string;
    slug: string;
    description: string;
    isPublic: boolean;
    createdBy: string | number;
  }> = {}): Promise<Catalog> {
    const timestamp = Date.now();
    const defaults = {
      name: `Test Catalog ${timestamp}`,
      slug: `test-catalog-${timestamp}`,
      description: "Test catalog for integration tests",
      isPublic: false,
    };

    return await this.payload.create({
      collection: "catalogs",
      data: {
        ...defaults,
        ...overrides,
      },
    });
  }

  /**
   * Create a test dataset with default values
   */
  async createDataset(overrides: Partial<{
    name: string;
    slug: string;
    catalog: string | number;
    language: string;
    isPublic: boolean;
    idStrategy: any;
  }> = {}): Promise<Dataset> {
    const timestamp = Date.now();
    const defaults = {
      name: `Test Dataset ${timestamp}`,
      slug: `test-dataset-${timestamp}`,
      language: "eng",
      isPublic: false,
      idStrategy: {
        type: "external",
        duplicateStrategy: "skip",
      },
    };

    return await this.payload.create({
      collection: "datasets",
      data: {
        ...defaults,
        ...overrides,
      },
    });
  }

  /**
   * Create a test scheduled import with default values
   */
  async createScheduledImport(overrides: Partial<{
    name: string;
    sourceUrl: string;
    catalog: string | number;
    dataset?: string | number;
    createdBy: string | number;
    enabled: boolean;
    webhookEnabled: boolean;
    webhookToken?: string;
    scheduleType: string;
    frequency: string;
    importNameTemplate: string;
    authConfig?: any;
    advancedOptions?: any;
    multiSheetConfig?: any;
    retryConfig?: any;
    lastStatus?: string;
    lastRun?: Date;
    lastError?: string;
    executionHistory?: any[];
    statistics?: any;
  }> = {}): Promise<ScheduledImport> {
    const timestamp = Date.now();
    const defaults = {
      name: `Test Scheduled Import ${timestamp}`,
      sourceUrl: "https://example.com/test-data.csv",
      enabled: true,
      webhookEnabled: false,
      scheduleType: "frequency",
      frequency: "daily",
      importNameTemplate: "{{name}} - {{date}}",
      authConfig: {
        type: "none",
      },
      advancedOptions: {
        autoApproveSchema: true,
        skipDuplicateChecking: false,
      },
    };

    return await this.payload.create({
      collection: "scheduled-imports",
      data: {
        ...defaults,
        ...overrides,
      },
    });
  }

  /**
   * Create a test import file
   */
  async createImportFile(overrides: Partial<{
    originalName: string;
    catalog: string | number;
    dataset?: string | number;
    scheduledImport?: string | number;
    status: string;
    fileHash?: string;
    metadata?: any;
    file?: any;
  }> = {}) {
    const timestamp = Date.now();
    const defaults = {
      originalName: `Test Import File ${timestamp}.csv`,
      status: "UPLOAD",
      metadata: {},
    };

    return await this.payload.create({
      collection: "import-files",
      data: {
        ...defaults,
        ...overrides,
      },
    });
  }

  /**
   * Create a test event
   */
  async createEvent(overrides: Partial<{
    name: string;
    slug: string;
    startDate: string;
    endDate?: string;
    location?: any;
    catalog: string | number;
    dataset?: string | number;
    importFile?: string | number;
  }> = {}) {
    const timestamp = Date.now();
    const defaults = {
      name: `Test Event ${timestamp}`,
      slug: `test-event-${timestamp}`,
      startDate: new Date().toISOString(),
    };

    return await this.payload.create({
      collection: "events",
      data: {
        ...defaults,
        ...overrides,
      },
    });
  }

  /**
   * Create a test job
   */
  async createJob(overrides: Partial<{
    task: string;
    status: string;
    priority?: number;
    input?: any;
    output?: any;
  }> = {}) {
    const defaults = {
      task: "test-task",
      status: "pending",
      priority: 5,
      input: {},
    };

    return await this.payload.create({
      collection: "jobs",
      data: {
        ...defaults,
        ...overrides,
      },
    });
  }

  /**
   * Clean up test data by ID
   */
  async cleanupById(collection: string, id: string | number) {
    try {
      await this.payload.delete({
        collection,
        id,
      });
    } catch (error) {
      // Ignore errors if already deleted
    }
  }

  /**
   * Clean up test data by query
   */
  async cleanupByQuery(collection: string, where: any) {
    try {
      const items = await this.payload.find({
        collection,
        where,
        limit: 1000,
      });

      for (const item of items.docs) {
        await this.cleanupById(collection, item.id);
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Create a complete test environment with related data
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
   * Create multiple test items
   */
  async createMany<T>(
    count: number,
    createFn: (index: number) => Promise<T>
  ): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < count; i++) {
      results.push(await createFn(i));
    }
    return results;
  }

  /**
   * Wait for a condition to be true
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
   * Wait for a job to complete
   */
  async waitForJob(jobId: string): Promise<any> {
    return this.waitFor(async () => {
      const job = await this.payload.findByID({
        collection: "jobs",
        id: jobId,
      });
      return job.status === "completed" || job.status === "failed";
    });
  }

  /**
   * Mock external data fetch responses
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
      arrayBuffer: async () => 
        typeof content === "string" ? Buffer.from(content) : content,
      text: async () => 
        typeof content === "string" ? content : content.toString(),
      json: async () => 
        type === "json" ? JSON.parse(content as string) : null,
    };
  }
}