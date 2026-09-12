/**
 * This file contains the main `SeedManager` class, which serves as the primary
 * entry point and orchestrator for all database seeding operations.
 *
 * It extends `SeedManagerBase` to inherit core functionalities like Payload initialization
 * and cleanup. This class composes various specialized operation classes to handle
 * different aspects of the seeding process:
 * - `ConfigDrivenSeeding`: For seeding based on the `seed.config.ts` file.
 * - `SeedingOperations`: For the core logic of creating documents and handling relationships.
 *
 * Truncation is handled via `lib/database/operations.ts` for consistency across the application.
 *
 * It exposes high-level methods like `seedWithConfig` and `truncate` that can be called
 * from seed scripts or other parts of the application.
 *
 * @module
 */
import { createDatabaseClient } from "../database/client";
import { truncateTables } from "../database/operations";
import { getDatabaseUrl } from "../database/url";
import { createLogger } from "../logger";
import { SeedManagerBase } from "./core/seed-manager-base";
import { ConfigDrivenSeeding } from "./operations/config-driven-seeding";
import { SeedingOperations, type SeedResult } from "./operations/seeding-operations";
import type { CollectionConfig } from "./seed.config";
import type { SeedOptions } from "./types";

const logger = createLogger("seed");

const assertSafeIdentifier = (value: string, pattern: RegExp, type: string): void => {
  if (!pattern.test(value)) {
    throw new Error(`Invalid ${type}: ${value}`);
  }
};

const toQualifiedCollectionTableName = (collection: string): string => {
  assertSafeIdentifier(collection, /^[a-z0-9-]+$/, "collection name");
  return `payload."${collection.replaceAll("-", "_")}"`;
};

export class SeedManager extends SeedManagerBase {
  private readonly configDrivenSeeding: ConfigDrivenSeeding;
  private readonly seedingOperations: SeedingOperations;
  private currentOptions: SeedOptions = {};

  constructor() {
    super();
    this.configDrivenSeeding = new ConfigDrivenSeeding(this);
    this.seedingOperations = new SeedingOperations(this);
  }

  /**
   * Configuration-driven seeding
   * Uses the seed.config.ts to determine what to seed and how.
   */
  async seedWithConfig(options: SeedOptions = {}) {
    this.currentOptions = options;
    return this.configDrivenSeeding.seedWithConfig(options);
  }

  /**
   * Get current seeding options.
   */
  get options(): SeedOptions {
    return this.currentOptions;
  }

  /**
   * Truncate collections before seeding.
   *
   * Uses PostgreSQL TRUNCATE CASCADE to automatically handle foreign key dependencies.
   * If no collections specified, truncates all tables (except migrations).
   *
   * @param collections - Optional array of collection names to truncate. If empty, truncates all.
   *
   * @example
   * ```typescript
   * await seedManager.truncate(); // Truncate all tables
   * await seedManager.truncate(['users', 'catalogs']); // Truncate only users and catalogs (+ their dependents via CASCADE)
   * ```
   */
  async truncate(collections: string[] = []): Promise<void> {
    await this.initialize();

    const dbUrl = getDatabaseUrl(true);
    if (!dbUrl) {
      throw new Error("DATABASE_URL is required for truncation");
    }

    if (collections.length === 0) {
      // Truncate all tables
      logger.info("Truncating all tables");

      const tableCount = await truncateTables(dbUrl, { schema: "payload", excludePatterns: ["payload_migrations%"] });
      logger.info(`Truncated ${tableCount} tables successfully`);
    } else {
      // Truncate specific collections using direct SQL with CASCADE
      logger.info({ collections }, "Truncating specific collections");

      const tableList = collections.map(toQualifiedCollectionTableName).join(", ");

      // Keep the lock timeout and TRUNCATE on one dedicated connection.
      // CASCADE handles FK dependencies; lock contention must fail, not hang.
      const client = createDatabaseClient({ connectionString: dbUrl });
      try {
        await client.connect();
        await client.query(`SET lock_timeout = '10s'`);
        await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
        logger.info({ collections }, `Truncated ${collections.length} collections successfully`);
      } finally {
        await client.end();
      }
    }
  }

  async truncateCollections(collections: string[]): Promise<void> {
    return this.truncate(collections);
  }

  async seedCollectionWithConfig(
    collectionName: string,
    config: CollectionConfig,
    environment: string,
    idempotent = false,
    deploymentEnv?: SeedOptions["deploymentEnv"]
  ): Promise<SeedResult | null> {
    return this.seedingOperations.seedCollectionWithConfig(
      collectionName,
      config,
      environment,
      idempotent,
      deploymentEnv
    );
  }
}

export const createSeedManager = (): SeedManager => new SeedManager();
