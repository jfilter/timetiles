import { getPayload } from "payload";
import config from "../../payload.config";
import { userSeeds } from "./seeds/users";
import { catalogSeeds } from "./seeds/catalogs";
import { datasetSeeds } from "./seeds/datasets";
import { eventSeeds } from "./seeds/events";
import { importSeeds } from "./seeds/imports";
import type { Config } from "../../payload-types";
import { createLogger, logError, logPerformance } from "../logger";

const logger = createLogger("seed");

export interface SeedOptions {
  collections?: string[];
  truncate?: boolean;
  environment?: "development" | "test" | "production";
}

export class SeedManager {
  private payload: Awaited<ReturnType<typeof getPayload>> | null;
  private isCleaningUp = false;

  constructor() {
    this.payload = null;
    this.isCleaningUp = false;
  }

  async initialize() {
    if (!this.payload) {
      logger.debug("Initializing Payload instance for seed manager");
      this.payload = await getPayload({
        config,
      });
      logger.debug("Payload instance initialized successfully");
    }
    return this.payload;
  }

  async seed(options: SeedOptions = {}) {
    const {
      collections = ["users", "catalogs", "datasets", "events", "imports"],
      truncate = false,
      environment = "development",
    } = options;

    await this.initialize();

    logger.info(
      { environment, collections, truncate },
      `Starting seed process for ${environment} environment`,
    );
    const startTime = Date.now();

    // Truncate collections if requested
    if (truncate) {
      await this.truncateCollections(collections);
    }

    // Seed collections in dependency order
    const seedOrder = ["users", "catalogs", "datasets", "events", "imports"];

    for (const collection of seedOrder) {
      if (collections.includes(collection)) {
        logger.info(`Seeding ${collection}...`);
        const collectionStartTime = Date.now();
        await this.seedCollection(collection, environment);
        logPerformance(`Seed ${collection}`, Date.now() - collectionStartTime);
      }
    }

    logPerformance("Complete seed process", Date.now() - startTime, {
      collections: collections.length,
      environment,
    });
    logger.info("Seed process completed successfully!");
  }

  async truncate(collections: string[] = []) {
    await this.initialize();
    logger.info({ collections }, "Starting truncate process...");
    const startTime = Date.now();

    await this.truncateCollections(collections);

    logPerformance("Truncate process", Date.now() - startTime, {
      collectionsCount: collections.length || "all",
    });
    logger.info("Truncate process completed!");
  }

  private async seedCollection(collection: string, environment: string) {
    const seedData = await this.getSeedData(collection, environment);

    if (!seedData || seedData.length === 0) {
      logger.warn(`No seed data found for ${collection}`);
      return;
    }

    logger.debug(
      { collection, count: seedData.length },
      `Found ${seedData.length} items to seed for ${collection}`,
    );

    for (const item of seedData) {
      try {
        // Resolve relationships before creating
        const resolvedItem = await this.resolveRelationships(
          item as unknown as Record<string, unknown>,
          collection,
        );

        // Skip if relationships couldn't be resolved
        if (!resolvedItem) {
          continue;
        }

        // For test environment, add timestamp to slug to ensure uniqueness
        if (environment === "test" && resolvedItem.slug) {
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          resolvedItem.slug = `${resolvedItem.slug}-${timestamp}-${randomSuffix}`;
        }

        await this.payload!.create({
          collection: collection as keyof Config["collections"],
          data: resolvedItem,
        });

        // Get a display name for the item
        const displayName =
          (item as { name?: string }).name ||
          (item as { email?: string }).email ||
          (item as { fileName?: string }).fileName ||
          (item as { id?: string }).id ||
          "Unknown";
        logger.debug(
          { collection, displayName },
          `Created ${collection} item: ${displayName}`,
        );
      } catch (error) {
        // Log the error but don't throw - allows graceful handling
        logError(error, `Failed to create ${collection} item`, {
          collection,
          item,
        });
      }
    }
  }

  private async getSeedData(collection: string, environment: string) {
    switch (collection) {
      case "users":
        return userSeeds(environment);
      case "catalogs":
        return catalogSeeds(environment);
      case "datasets":
        return datasetSeeds(environment);
      case "events":
        return eventSeeds(environment);
      case "imports":
        return importSeeds(environment);
      default:
        logger.warn(`Unknown collection: ${collection}`);
        return []; // Return empty array instead of throwing
    }
  }

  private async truncateCollections(collections: string[]) {
    const isFullTruncate = collections.length === 0;

    if (isFullTruncate) {
      // Get all collection names for full truncate
      collections = [
        "users",
        "catalogs",
        "datasets",
        "events",
        "imports",
        "media",
      ];
    }

    // For selective truncation, only truncate the specified collections
    // without cascading to dependencies (let the test decide what to truncate)
    const collectionsToTruncate = new Set(collections);

    // Only add cascading dependencies if we're doing a full truncate
    if (isFullTruncate) {
      // This is a full truncate - add dependency cascading
      for (const collection of collections) {
        if (collection === "catalogs") {
          collectionsToTruncate.add("datasets");
          collectionsToTruncate.add("events");
          collectionsToTruncate.add("imports");
        }
        if (collection === "datasets") {
          collectionsToTruncate.add("events");
          collectionsToTruncate.add("imports");
        }
      }
    }

    // Truncate in reverse dependency order to avoid foreign key constraints
    const truncateOrder = [
      "imports",
      "events",
      "datasets",
      "catalogs",
      "media",
      "users",
    ];

    for (const collection of truncateOrder) {
      if (collectionsToTruncate.has(collection)) {
        try {
          // Use pagination to handle large datasets
          let hasMore = true;
          let totalDeleted = 0;

          while (hasMore) {
            const items = await this.payload!.find({
              collection: collection as keyof Config["collections"],
              limit: 1000, // Get more items at once
              depth: 0,
            });

            if (items.docs.length === 0) {
              hasMore = false;
              break;
            }

            // Delete all items in this batch
            for (const item of items.docs) {
              try {
                await this.payload!.delete({
                  collection: collection as keyof Config["collections"],
                  id: item.id,
                });
                totalDeleted++;
              } catch (deleteError) {
                logger.warn(
                  {
                    error: deleteError,
                    collection,
                    itemId: item.id,
                  },
                  `Failed to delete ${collection} item ${item.id}`,
                );
              }
            }

            // Always check again - don't assume based on batch size
            hasMore = items.docs.length > 0;
          }

          logger.info(
            { collection, totalDeleted },
            `Truncated ${collection} (${totalDeleted} items)`,
          );
        } catch (error) {
          logError(error, `Failed to truncate ${collection}`, { collection });
        }
      }
    }
  }

  private async resolveRelationships(
    item: Record<string, unknown>,
    collection: string,
  ): Promise<Record<string, unknown> | null> {
    const resolvedItem = { ...item };

    // Resolve catalog relationships
    if (item.catalog && typeof item.catalog === "string") {
      logger.debug(`Looking for catalog with slug: ${item.catalog}`);

      // In test environment, look for catalogs by name instead of slug due to slug modifications
      const searchField =
        collection === "datasets" ||
        collection === "imports" ||
        collection === "events"
          ? "name"
          : "slug";
      const searchValue =
        item.catalog === "test-catalog"
          ? "Test Catalog"
          : item.catalog === "environmental-data"
            ? "Environmental Data"
            : item.catalog === "economic-indicators"
              ? "Economic Indicators"
              : item.catalog;

      const catalog = await this.payload!.find({
        collection: "catalogs",
        where: {
          [searchField]: {
            equals: searchValue,
          },
        },
        limit: 1,
      });

      logger.debug(
        { count: catalog?.docs?.length || 0, searchField, searchValue },
        `Found ${catalog?.docs?.length || 0} catalogs with ${searchField}: ${searchValue}`,
      );

      if (catalog?.docs?.length && catalog.docs.length > 0) {
        logger.debug(
          { catalogSlug: item.catalog, catalogId: catalog.docs[0]?.id },
          `Resolved catalog ${item.catalog} to ID: ${catalog.docs[0]?.id}`,
        );
        resolvedItem.catalog = catalog.docs[0]?.id;
      } else {
        logger.warn(
          { searchField, searchValue, collection },
          `Could not find catalog with ${searchField}: ${searchValue} - skipping ${collection} item`,
        );
        return null; // Skip this item instead of throwing
      }
    }

    // Resolve dataset relationships
    if (item.dataset && typeof item.dataset === "string") {
      // In test environment, look for datasets by name instead of slug due to slug modifications
      const searchValue =
        item.dataset === "test-dataset"
          ? "Test Dataset"
          : item.dataset === "air-quality-measurements"
            ? "Air Quality Measurements"
            : item.dataset === "gdp-growth-rates"
              ? "GDP Growth Rates"
              : item.dataset;

      const dataset = await this.payload!.find({
        collection: "datasets",
        where: {
          name: {
            equals: searchValue,
          },
        },
        limit: 1,
      });

      if (dataset?.docs?.length > 0) {
        logger.debug(
          { datasetName: searchValue, datasetId: dataset.docs[0]?.id },
          `Resolved dataset ${searchValue} to ID: ${dataset.docs[0]?.id}`,
        );
        resolvedItem.dataset = dataset.docs[0]?.id;
      } else {
        logger.warn(
          { searchValue, collection },
          `Could not find dataset with name: ${searchValue} - skipping ${collection} item`,
        );
        return null; // Skip this item instead of throwing
      }
    }

    return resolvedItem;
  }

  async cleanup() {
    // Prevent multiple cleanup calls
    if (this.isCleaningUp || !this.payload) {
      return;
    }

    this.isCleaningUp = true;

    try {
      logger.info("Starting cleanup process...");

      // Try to close the database connection pool with timeout
      if (
        this.payload.db &&
        this.payload.db.pool &&
        !(this.payload.db.pool as any).ended
      ) {
        logger.debug("Closing database pool...");
        try {
          await Promise.race([
            this.payload.db.pool.end(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Pool.end() timeout")), 3000),
            ),
          ]);
          logger.debug("Database pool closed successfully");
        } catch {
          logger.debug(
            "Pool close timeout - skipping force closure to avoid double end",
          );
        }
      }

      // Try to close Drizzle client if it exists
      if (
        this.payload.db &&
        this.payload.db.drizzle &&
        (this.payload.db.drizzle as any).$client &&
        !(this.payload.db.drizzle as any).$client.ended
      ) {
        logger.debug("Closing drizzle client...");
        try {
          await Promise.race([
            (this.payload.db.drizzle as any).$client.end(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Drizzle client.end() timeout")),
                2000,
              ),
            ),
          ]);
          logger.debug("Drizzle client closed successfully");
        } catch {
          logger.debug("Drizzle client close timeout - continuing");
        }
      }

      // Try to destroy the database instance
      if (this.payload.db && typeof this.payload.db.destroy === "function") {
        logger.debug("Destroying database instance...");
        try {
          await Promise.race([
            this.payload.db.destroy(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Database destroy timeout")),
                2000,
              ),
            ),
          ]);
          logger.debug("Database instance destroyed successfully");
        } catch {
          logger.debug("Database destroy timeout - continuing");
        }
      }

      // Clean up payload instance
      this.payload = null;
      logger.info("Cleanup completed successfully");
    } catch (error: unknown) {
      logError(error, "Error during cleanup");
      this.payload = null;
    } finally {
      this.isCleaningUp = false;
    }
  }

  async getCollectionCount(collection: string): Promise<number> {
    await this.initialize();
    const result = await this.payload!.find({
      collection: collection as keyof Config["collections"],
      limit: 0, // Only get count, not documents
    });
    return result.totalDocs;
  }
}

// Factory function for creating seed manager
export function createSeedManager(): SeedManager {
  return new SeedManager();
}
