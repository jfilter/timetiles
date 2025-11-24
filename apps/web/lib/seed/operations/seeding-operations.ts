/**
 * This file contains the `SeedingOperations` class, which orchestrates the core logic
 * for seeding data into the various collections.
 *
 * It is responsible for:
 * - Retrieving the appropriate seed data for a given collection and environment.
 * - Handling the seeding of both regular and global collections.
 * - Resolving relationships between documents before creation.
 * - Creating the documents in the database, with batching and error handling.
 * - Determining the correct dependency order for seeding collections to ensure that
 *   relational data is created before the documents that depend on it.
 *
 * @module
 */
import { createLogger } from "@/lib/logger";
import type { Config } from "@/payload-types";

import { COLLECTION_GEOCODING_PROVIDERS, FOOTER_SLUG, MAIN_MENU_SLUG } from "../constants";
import type { CollectionConfig } from "../seed.config";
import type { SeedManager } from "../seed-manager";
import { catalogSeeds } from "../seeds/catalogs";
import { datasetSeeds } from "../seeds/datasets";
import { eventSeeds } from "../seeds/events";
import { footerSeed } from "../seeds/footer";
import { geocodingProviderSeeds } from "../seeds/geocoding-providers";
import { mainMenuSeed } from "../seeds/main-menu";
import { pagesSeed } from "../seeds/pages";
import { userSeeds } from "../seeds/users";
import type { SeedData } from "../types";
import { DataProcessing } from "./data-processing";
import { QueryBuilders } from "./query-builders";

const logger = createLogger("seed");
const PAYLOAD_NOT_INITIALIZED_ERROR = "Payload not initialized";

export interface SeedItemError {
  item: string;
  error: string;
  type: "validation" | "duplicate" | "database" | "timeout" | "unknown";
}

export interface SeedResult {
  created: number;
  skipped: number;
  failed: number;
  errors: SeedItemError[];
}

type SeedItemResult = "created" | "skipped" | "failed";

export class SeedingOperations {
  private readonly dataProcessing = new DataProcessing();
  private readonly queryBuilders = new QueryBuilders();

  constructor(private readonly seedManager: SeedManager) {}

  async seedCollectionWithConfig(
    collectionName: string,
    config: CollectionConfig,
    environment: string
  ): Promise<SeedResult | null> {
    logger.debug({ collection: collectionName, config }, `Starting configuration-driven seeding for ${collectionName}`);

    // Validate configuration and get count
    const count = this.dataProcessing.determineCollectionCount(config, environment);
    if (!this.dataProcessing.isValidCount(count, collectionName)) {
      return null;
    }

    // Get base seed data
    const baseSeedData = this.getSeedData(collectionName, environment);
    if (!this.dataProcessing.isValidSeedData(baseSeedData, collectionName)) {
      logger.warn(`No seed data available for ${collectionName}`);
      return null;
    }

    // Prepare seed data according to configuration
    const preparedData = this.dataProcessing.prepareSeedData(baseSeedData, count, collectionName);

    // Apply data transformations
    const transformedData = this.dataProcessing.applyDataTransformations(preparedData, config, collectionName);

    // Handle global collections
    if (collectionName === MAIN_MENU_SLUG || collectionName === FOOTER_SLUG) {
      await this.seedGlobalCollection(transformedData, collectionName);
      return null;
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
    const result = await this.createCollectionItems(resolvedSeedData, collectionName, environment, config);

    // Log summary
    this.logCollectionSummary(collectionName, result, resolvedSeedData.length);

    return result;
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity -- Global seeding requires handling multiple conditional paths
  private async seedGlobalCollection(seedData: SeedData, collectionName: string): Promise<void> {
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
        logger.info(`Seeded ${MAIN_MENU_SLUG} global successfully!`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error({ global: collectionName }, `Failed to seed ${MAIN_MENU_SLUG} global: ${errorMsg}`);
      }
    } else if (collectionName === FOOTER_SLUG) {
      try {
        const footerData = Array.isArray(seedData) && seedData.length > 0 ? seedData[0] : seedData;
        const payload = this.seedManager.payloadInstance;
        if (!payload) {
          throw new Error(PAYLOAD_NOT_INITIALIZED_ERROR);
        }
        await payload.updateGlobal({
          slug: FOOTER_SLUG,
          data: footerData as Config["globals"]["footer"],
        });
        logger.info(`Seeded ${FOOTER_SLUG} global successfully!`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error({ global: collectionName }, `Failed to seed ${FOOTER_SLUG} global: ${errorMsg}`);
      }
    }
  }

  private async createCollectionItems(
    resolvedSeedData: Record<string, unknown>[],
    collectionName: string,
    environment: string,
    config: CollectionConfig
  ): Promise<SeedResult> {
    const BATCH_SIZE = 10; // Process in smaller batches
    const isCI = process.env.CI === "true";

    const result: SeedResult = {
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // Process in batches to prevent overwhelming the database
    for (let i = 0; i < resolvedSeedData.length; i += BATCH_SIZE) {
      const batch = resolvedSeedData.slice(i, i + BATCH_SIZE);
      this.logBatchProgress(collectionName, i, batch.length, resolvedSeedData.length, BATCH_SIZE);

      const batchResult = await this.processBatch(batch, collectionName, environment, config, isCI);

      // Accumulate results
      result.created += batchResult.created;
      result.skipped += batchResult.skipped;
      result.failed += batchResult.failed;
      result.errors.push(...batchResult.errors);

      await this.delayBetweenBatches(i, BATCH_SIZE, resolvedSeedData.length, isCI);
    }

    return result;
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

  private logCollectionSummary(collectionName: string, result: SeedResult, totalAttempted: number): void {
    const { created, skipped, failed, errors } = result;

    // Always log summary at info level for visibility
    logger.info(
      { collection: collectionName, created, skipped, failed, total: totalAttempted },
      `Seeded ${collectionName}: ${created} created, ${skipped} skipped, ${failed} failed (${totalAttempted} total)`
    );

    // Log error summary if there are failures
    if (errors.length > 0) {
      // Group errors by type
      const errorsByType = errors.reduce(
        (acc, error) => {
          acc[error.type] = (acc[error.type] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const summary = Object.entries(errorsByType)
        .map(([type, count]) => `${count} ${type}`)
        .join(", ");

      logger.warn({ collection: collectionName, errorsByType }, `${collectionName} errors: ${summary}`);

      // Show first 3 unique errors as examples
      const uniqueErrors = Array.from(new Set(errors.map((e) => e.error))).slice(0, 3);
      if (uniqueErrors.length > 0) {
        logger.warn({ collection: collectionName }, `Example errors:\n  - ${uniqueErrors.join("\n  - ")}`);
      }
    }
  }

  private async processBatch(
    batch: Record<string, unknown>[],
    collectionName: string,
    environment: string,
    config: CollectionConfig,
    isCI: boolean
  ): Promise<SeedResult> {
    const result: SeedResult = {
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // Process items sequentially to avoid overwhelming the database
    for (const resolvedItem of batch) {
      const itemResult = await this.createItemWithErrorHandling(
        resolvedItem,
        collectionName,
        environment,
        config,
        isCI
      );

      if (itemResult.result === "created") {
        result.created++;
      } else if (itemResult.result === "skipped") {
        result.skipped++;
      } else {
        result.failed++;
        if (itemResult.error) {
          result.errors.push(itemResult.error);
        }
      }
    }

    return result;
  }

  private async createItemWithErrorHandling(
    resolvedItem: Record<string, unknown>,
    collectionName: string,
    environment: string,
    config: CollectionConfig,
    isCI: boolean
  ): Promise<{ result: SeedItemResult; error?: SeedItemError }> {
    const OPERATION_TIMEOUT = 30000; // 30 second timeout per item

    try {
      const createItemPromise = this.createSingleItem(resolvedItem, collectionName, environment);

      if (isCI) {
        const result = await Promise.race([
          createItemPromise,
          new Promise<SeedItemResult>((_resolve, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout creating ${collectionName} item after ${OPERATION_TIMEOUT}ms`)),
              OPERATION_TIMEOUT
            )
          ),
        ]);
        return { result };
      } else {
        const result = await createItemPromise;
        return { result };
      }
    } catch (error) {
      const seedError = this.handleCreateItemError(error, collectionName, resolvedItem, config, isCI);
      return { result: "failed", error: seedError };
    }
  }

  private handleCreateItemError(
    error: unknown,
    collectionName: string,
    resolvedItem: Record<string, unknown>,
    _config: CollectionConfig,
    isCI: boolean
  ): SeedItemError {
    const itemName = this.queryBuilders.getDisplayName(resolvedItem);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log concisely - only essential info
    logger.debug(
      { collection: collectionName, item: itemName },
      `Failed to create ${collectionName} item "${itemName}": ${errorMessage}`
    );

    // In CI, fail fast on persistent errors
    if (isCI && errorMessage.includes("Timeout")) {
      logger.error(`CI timeout detected, aborting ${collectionName} seeding`);
      throw error;
    }

    // Categorize error type
    let errorType: SeedItemError["type"] = "unknown";

    if (errorMessage.includes("Timeout")) {
      errorType = "timeout";
    } else if (errorMessage.includes("duplicate") || errorMessage.includes("unique constraint")) {
      errorType = "duplicate";
    } else if (errorMessage.includes("validation") || errorMessage.includes("invalid")) {
      errorType = "validation";
    } else if (errorMessage.includes("database") || errorMessage.includes("query")) {
      errorType = "database";
    }

    return {
      item: itemName,
      error: errorMessage,
      type: errorType,
    };
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
  ): Promise<SeedItemResult> {
    // For test environment, add timestamp to slug to ensure uniqueness
    if (environment === "test" && resolvedItem.slug != null) {
      resolvedItem.slug = this.dataProcessing.generateTestSlug(resolvedItem.slug);
    }

    // Check if item already exists to avoid duplicate key errors
    const existingItem = await this.findExistingItem(collectionName, resolvedItem);
    if (existingItem != null) {
      const displayName = this.queryBuilders.getDisplayName(resolvedItem);
      logger.debug(
        { collection: collectionName, displayName },
        `Skipping existing ${collectionName} item: ${displayName}`
      );
      return "skipped";
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
      const fileBuffer = new Uint8Array(Buffer.from(fileContent, "utf8"));

      await payload.create({
        collection: collectionName as keyof Config["collections"],
        data: resolvedItem,
        file: {
          data: fileBuffer as Buffer,
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
    return "created";
  }

  private async findExistingItem(collection: string, item: Record<string, unknown>) {
    const where = this.queryBuilders.buildWhereClause(collection, item);

    // Only query if we have a valid where clause
    if (Object.keys(where).length === 0) {
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
      case COLLECTION_GEOCODING_PROVIDERS:
        return geocodingProviderSeeds(environment);
      case MAIN_MENU_SLUG:
        return [mainMenuSeed];
      case FOOTER_SLUG:
        return [footerSeed];
      case "pages":
        return pagesSeed;
      default:
        logger.warn(`Unknown collection for seeding: ${collectionOrGlobal}`);
        return [];
    }
  }
}
