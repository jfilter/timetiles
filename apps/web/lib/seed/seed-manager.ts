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
import { truncateTables } from "../database/operations";
import { getDatabaseUrl } from "../database/url";
import { createLogger } from "../logger";
import { SeedManagerBase } from "./core/seed-manager-base";
import { ConfigDrivenSeeding } from "./operations/config-driven-seeding";
import { SeedingOperations } from "./operations/seeding-operations";
import type { CollectionConfig } from "./seed.config";
import type { SeedOptions } from "./types";

const logger = createLogger("seed");

export class SeedManager extends SeedManagerBase {
  private readonly configDrivenSeeding: ConfigDrivenSeeding;
  private readonly seedingOperations: SeedingOperations;

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
    return this.configDrivenSeeding.seedWithConfig(options);
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
      const tableCount = await truncateTables(dbUrl, {
        schema: "payload",
        excludePatterns: ["payload_migrations%"],
      });
      logger.info(`Truncated ${tableCount} tables successfully`);
    } else {
      // Truncate specific collections using direct SQL with CASCADE
      logger.info({ collections }, "Truncating specific collections");

      const client = await import("../database/client").then((m) =>
        m.createDatabaseClient({ connectionString: dbUrl })
      );
      try {
        await client.connect();

        // Build table list with proper schema qualification
        // Convert collection names (kebab-case) to table names (snake_case)
        const tableList = collections.map((name) => `payload."${name.replace(/-/g, "_")}"`).join(", ");

        // TRUNCATE CASCADE automatically handles dependent tables (e.g., events when truncating datasets)
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

  async seedCollectionWithConfig(collectionName: string, config: CollectionConfig, environment: string) {
    return this.seedingOperations.seedCollectionWithConfig(collectionName, config, environment);
  }
}

export const createSeedManager = (): SeedManager => new SeedManager();
