/**
 * @module This file contains the `SeedingOperations` class, which orchestrates the core logic
 * for seeding data into the various collections.
 *
 * It is responsible for:
 * - Retrieving the appropriate seed data for a given collection and environment.
 * - Handling the seeding of both regular and global collections.
 * - Resolving relationships between documents before creation.
 * - Creating the documents in the database, with batching and error handling.
 * - Determining the correct dependency order for seeding collections to ensure that
 *   relational data is created before the documents that depend on it.
 */
import { createLogger } from "@/lib/logger";
import { logError } from "@/lib/logger";
import type { Config } from "@/payload-types";

import { getDependencyOrder } from "../relationship-config";
import type { CollectionConfig } from "../seed.config";
import type { SeedManager } from "../seed-manager";
import { catalogSeeds } from "../seeds/catalogs";
import { datasetSeeds } from "../seeds/datasets";
import { eventSeeds } from "../seeds/events";
import { importFileSeeds } from "../seeds/import-files";
import { importJobSeeds } from "../seeds/import-jobs";
import { mainMenuSeed } from "../seeds/main-menu";
import { pagesSeed } from "../seeds/pages";
import { userSeeds } from "../seeds/users";
import type { SeedData } from "../types";
import { DataProcessing } from "./data-processing";
import { QueryBuilders } from "./query-builders";

const logger = createLogger("seed");
const PAYLOAD_NOT_INITIALIZED_ERROR = "Payload not initialized";

export class SeedingOperations {
  private readonly dataProcessing = new DataProcessing();
  private readonly queryBuilders = new QueryBuilders();

  constructor(private readonly seedManager: SeedManager) {}

  async seedCollectionWithConfig(collectionName: string, config: CollectionConfig, environment: string) {
    logger.debug({ collection: collectionName, config }, `Starting configuration-driven seeding for ${collectionName}`);

    // Validate configuration and get count
    const count = this.dataProcessing.determineCollectionCount(config, environment);
    if (!this.dataProcessing.isValidCount(count, collectionName)) {
      return;
    }

    // Get base seed data
    const baseSeedData = this.getSeedData(collectionName, environment);
    if (!this.dataProcessing.isValidSeedData(baseSeedData, collectionName)) {
      logger.warn(`No seed data available for ${collectionName}`);
      return;
    }

    // Prepare seed data according to configuration
    const preparedData = this.dataProcessing.prepareSeedData(baseSeedData, count, collectionName);

    // Apply data transformations
    const transformedData = this.dataProcessing.applyDataTransformations(preparedData, config, collectionName);

    // Handle global collections
    const MAIN_MENU_SLUG = "main-menu";
    if (collectionName === MAIN_MENU_SLUG) {
      await this.seedGlobalCollection(transformedData, collectionName);
      return;
    }

    // Resolve relationships for regular collections
    const relationshipResolver = this.seedManager.relationshipResolverInstance;
    if (!relationshipResolver) {
      throw new Error("RelationshipResolver not initialized");
    }
    const resolvedSeedData = await relationshipResolver.resolveCollectionRelationships(
      Array.isArray(transformedData)
        ? (transformedData as Record<string, unknown>[])
        : [transformedData as Record<string, unknown>],
      collectionName
    );

    // Create collection items
    await this.createCollectionItems(resolvedSeedData, collectionName, environment, config);

    logger.info(`Completed seeding ${collectionName} with ${resolvedSeedData.length} items`);
  }

  async seedCollection(collectionOrGlobal: string, environment: string) {
    const seedData = this.getSeedData(collectionOrGlobal, environment);

    if (seedData == null || seedData == undefined || seedData.length == 0) {
      logger.warn(`No seed data found for ${collectionOrGlobal}`);
      return;
    }

    // Handle global collections
    const MAIN_MENU_SLUG = "main-menu";
    if (collectionOrGlobal === MAIN_MENU_SLUG) {
      await this.seedGlobalCollection(seedData, collectionOrGlobal);
      return;
    }

    const itemCount = Array.isArray(seedData) ? seedData.length : 1;
    logger.debug(
      { collection: collectionOrGlobal, count: itemCount },
      `Found ${itemCount} items to seed for ${collectionOrGlobal}`
    );

    // Resolve relationships
    const relationshipResolver = this.seedManager.relationshipResolverInstance;
    if (!relationshipResolver) {
      throw new Error("RelationshipResolver not initialized");
    }
    const resolvedSeedData = await relationshipResolver.resolveCollectionRelationships(
      Array.isArray(seedData) ? (seedData as Record<string, unknown>[]) : [seedData as Record<string, unknown>],
      collectionOrGlobal
    );

    // Create collection items (reuse helper with empty config)
    await this.createCollectionItems(resolvedSeedData, collectionOrGlobal, environment, {});
  }

  getDependencyOrder(
    collections: string[] = ["users", "catalogs", "datasets", "events", "import-files", "import-jobs"]
  ) {
    return getDependencyOrder(collections);
  }

  private async seedGlobalCollection(seedData: SeedData, collectionName: string): Promise<void> {
    const MAIN_MENU_SLUG = "main-menu";
    if (collectionName === MAIN_MENU_SLUG) {
      try {
        const menuData = Array.isArray(seedData) && seedData.length > 0 ? seedData[0] : seedData;
        const payload = this.seedManager.payloadInstance;
        if (!payload) {
          throw new Error(PAYLOAD_NOT_INITIALIZED_ERROR);
        }
        await payload.updateGlobal({
          slug: MAIN_MENU_SLUG,
          data: menuData as Config["globals"]["main-menu"],
        });
        logger.info("Seeded main-menu global successfully!");
      } catch (error) {
        logError(error, "Failed to seed main-menu global", {
          global: MAIN_MENU_SLUG,
          data: Array.isArray(seedData) && seedData.length > 0 ? seedData[0] : {},
        });
      }
    }
  }

  private async createCollectionItems(
    resolvedSeedData: Record<string, unknown>[],
    collectionName: string,
    environment: string,
    config: CollectionConfig
  ): Promise<void> {
    const BATCH_SIZE = 10; // Process in smaller batches
    const isCI = process.env.CI === "true";

    // Process in batches to prevent overwhelming the database
    for (let i = 0; i < resolvedSeedData.length; i += BATCH_SIZE) {
      const batch = resolvedSeedData.slice(i, i + BATCH_SIZE);
      this.logBatchProgress(collectionName, i, batch.length, resolvedSeedData.length, BATCH_SIZE);

      await this.processBatch(batch, collectionName, environment, config, isCI);
      await this.delayBetweenBatches(i, BATCH_SIZE, resolvedSeedData.length, isCI);
    }
  }

  private logBatchProgress(
    collectionName: string,
    batchStart: number,
    batchSize: number,
    totalItems: number,
    BATCH_SIZE: number
  ): void {
    logger.debug(
      { collection: collectionName, batchStart, batchSize },
      `Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(totalItems / BATCH_SIZE)}`
    );
  }

  private async processBatch(
    batch: Record<string, unknown>[],
    collectionName: string,
    environment: string,
    config: CollectionConfig,
    isCI: boolean
  ): Promise<void> {
    for (const resolvedItem of batch) {
      await this.createItemWithErrorHandling(resolvedItem, collectionName, environment, config, isCI);
    }
  }

  private async createItemWithErrorHandling(
    resolvedItem: Record<string, unknown>,
    collectionName: string,
    environment: string,
    config: CollectionConfig,
    isCI: boolean
  ): Promise<void> {
    const OPERATION_TIMEOUT = 30000; // 30 second timeout per item

    try {
      const createItemPromise = this.createSingleItem(resolvedItem, collectionName, environment);

      if (isCI) {
        await Promise.race([
          createItemPromise,
          new Promise((_resolve, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout creating ${collectionName} item after ${OPERATION_TIMEOUT}ms`)),
              OPERATION_TIMEOUT
            )
          ),
        ]);
      } else {
        await createItemPromise;
      }
    } catch (error) {
      this.handleCreateItemError(error, collectionName, resolvedItem, config, isCI);
    }
  }

  private handleCreateItemError(
    error: unknown,
    collectionName: string,
    resolvedItem: Record<string, unknown>,
    config: CollectionConfig,
    isCI: boolean
  ): void {
    logError(error, `Failed to create ${collectionName} item`, {
      collection: collectionName,
      item: resolvedItem,
      config,
    });

    // In CI, fail fast on persistent errors
    if (isCI && error instanceof Error && error.message.includes("Timeout")) {
      logger.error(`CI timeout detected, aborting ${collectionName} seeding`);
      throw error;
    }
  }

  private async delayBetweenBatches(
    currentIndex: number,
    BATCH_SIZE: number,
    totalItems: number,
    isCI: boolean
  ): Promise<void> {
    if (currentIndex + BATCH_SIZE < totalItems) {
      await new Promise((resolve) => setTimeout(resolve, isCI ? 50 : 100));
    }
  }

  private async createSingleItem(
    resolvedItem: Record<string, unknown>,
    collectionName: string,
    environment: string
  ): Promise<void> {
    // For test environment, add timestamp to slug to ensure uniqueness
    if (environment == "test" && resolvedItem.slug != null && resolvedItem.slug != undefined) {
      resolvedItem.slug = this.dataProcessing.generateTestSlug(resolvedItem.slug);
    }

    // Check if item already exists to avoid duplicate key errors
    const existingItem = await this.findExistingItem(collectionName, resolvedItem);
    if (existingItem != null && existingItem != undefined) {
      const displayName = this.queryBuilders.getDisplayName(resolvedItem);
      logger.debug(
        { collection: collectionName, displayName },
        `Skipping existing ${collectionName} item: ${displayName}`
      );
      return;
    }

    const payload = this.seedManager.payloadInstance;
    if (!payload) {
      throw new Error(PAYLOAD_NOT_INITIALIZED_ERROR);
    }

    // Check if this is an upload collection and create dummy file data if needed
    const collectionConfig = payload.config.collections?.find((c: { slug: string }) => c.slug === collectionName);
    const isUploadCollection = collectionConfig?.upload;

    if (isUploadCollection) {
      // Create dummy file data for upload collections
      const filename = (resolvedItem as { filename?: string }).filename ?? `seed-${Date.now()}.txt`;
      const fileContent = `Dummy seed file for ${collectionName}`;
      const fileBuffer = Buffer.from(fileContent, "utf8");

      await payload.create({
        collection: collectionName as keyof Config["collections"],
        data: resolvedItem,
        file: {
          data: fileBuffer,
          name: filename,
          size: fileBuffer.length,
          mimetype: (resolvedItem as { mimeType?: string }).mimeType ?? "text/plain",
        },
      });
    } else {
      await payload.create({
        collection: collectionName as keyof Config["collections"],
        data: resolvedItem,
      });
    }

    const displayName = this.queryBuilders.getDisplayName(resolvedItem);
    logger.debug({ collection: collectionName, displayName }, `Created ${collectionName} item: ${displayName}`);
  }

  private async findExistingItem(collection: string, item: Record<string, unknown>) {
    const where = this.queryBuilders.buildWhereClause(collection, item);

    // Only query if we have a valid where clause
    if (Object.keys(where).length == 0) {
      return null;
    }

    try {
      const payload = this.seedManager.payloadInstance;
      if (!payload) {
        throw new Error("Payload not initialized");
      }
      const result = await payload.find({
        collection: collection as keyof Config["collections"],
        where,
        limit: 1,
      });

      return result.docs.length > 0 ? result.docs[0] : null;
    } catch (error) {
      // If the query fails, assume the item doesn't exist
      logger.debug(`Failed to check existing item for ${collection}`, { error });
      return null;
    }
  }

  private getSeedData(collectionOrGlobal: string, environment: string): SeedData {
    switch (collectionOrGlobal) {
      case "users":
        return userSeeds(environment);
      case "catalogs":
        return catalogSeeds(environment);
      case "datasets":
        return datasetSeeds(environment);
      case "events":
        return eventSeeds(environment);
      case "import-jobs":
        return importJobSeeds(environment);
      case "import-files":
        return importFileSeeds(environment);
      case "main-menu":
        return [mainMenuSeed];
      case "pages":
        return pagesSeed;
      default:
        logger.warn(`Unknown collection for seeding: ${collectionOrGlobal}`);
        return [];
    }
  }
}
