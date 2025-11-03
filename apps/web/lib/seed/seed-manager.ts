/**
 * This file contains the main `SeedManager` class, which serves as the primary
 * entry point and orchestrator for all database seeding operations.
 *
 * It extends `SeedManagerBase` to inherit core functionalities like Payload initialization
 * and cleanup. This class composes various specialized operation classes to handle
 * different aspects of the seeding process:
 * - `ConfigDrivenSeeding`: For seeding based on the `seed.config.ts` file.
 * - `SeedingOperations`: For the core logic of creating documents and handling relationships.
 * - `TruncationOperations`: For clearing database collections before seeding.
 *
 * It exposes high-level methods like `seedWithConfig` and `truncate` that can be called
 * from seed scripts or other parts of the application.
 *
 * @module
 */
import { createLogger, logPerformance } from "../logger";
import { SeedManagerBase } from "./core/seed-manager-base";
import { ConfigDrivenSeeding } from "./operations/config-driven-seeding";
import { SeedingOperations } from "./operations/seeding-operations";
import { TruncationOperations } from "./operations/truncation";
import type { CollectionConfig } from "./seed.config";
import type { SeedOptions } from "./types";

const logger = createLogger("seed");

export class SeedManager extends SeedManagerBase {
  private readonly configDrivenSeeding: ConfigDrivenSeeding;
  private readonly seedingOperations: SeedingOperations;
  private readonly truncationOperations: TruncationOperations;

  constructor() {
    super();
    this.configDrivenSeeding = new ConfigDrivenSeeding(this);
    this.seedingOperations = new SeedingOperations(this);
    this.truncationOperations = new TruncationOperations(this);
  }

  /**
   * Configuration-driven seeding
   * Uses the seed.config.ts to determine what to seed and how.
   */
  async seedWithConfig(options: SeedOptions = {}) {
    return this.configDrivenSeeding.seedWithConfig(options);
  }

  /**
   * Legacy seeding method (maintains backward compatibility).
   */
  async seed(options: SeedOptions = {}) {
    // If useConfig is true, delegate to the new configuration-driven method
    if (options.useConfig === true) {
      return this.seedWithConfig(options);
    }

    const {
      collections = ["users", "catalogs", "datasets", "events", "import-files", "import-jobs", "main-menu", "pages"],
      truncate = false,
      environment = "development",
    } = options;

    await this.initialize();

    logger.info({ environment, collections, truncate }, `Starting seed process for ${environment} environment`);
    const startTime = Date.now();

    if (truncate) {
      await this.truncate(collections);
    }

    // Get dependency order for seeding
    const seedOrder = this.seedingOperations.getDependencyOrder(collections);

    for (const collection of seedOrder) {
      if (collections.includes(collection)) {
        const collectionStartTime = Date.now();
        await this.seedingOperations.seedCollection(collection, environment);
        logPerformance(`Seed ${collection}`, Date.now() - collectionStartTime);
      }
    }

    logPerformance("Complete seed process", Date.now() - startTime, {
      environment,
      collections: collections.length,
    });
  }

  async truncate(collections: string[] = []) {
    return this.truncationOperations.truncate(collections);
  }

  async truncateCollections(collections: string[]): Promise<void> {
    return this.truncationOperations.truncateCollections(collections);
  }

  async seedCollectionWithConfig(collectionName: string, config: CollectionConfig, environment: string) {
    return this.seedingOperations.seedCollectionWithConfig(collectionName, config, environment);
  }
}

export const createSeedManager = (): SeedManager => new SeedManager();
