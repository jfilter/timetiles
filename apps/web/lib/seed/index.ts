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

        // Check if item already exists to avoid duplicate key errors
        const existingItem = await this.findExistingItem(collection, resolvedItem);
        if (existingItem) {
          const displayName = this.getDisplayName(item);
          logger.debug(
            { collection, displayName },
            `Skipping existing ${collection} item: ${displayName}`,
          );
          continue;
        }

        await this.payload!.create({
          collection: collection as keyof Config["collections"],
          data: resolvedItem,
        });

        // Get a display name for the item
        const displayName = this.getDisplayName(item);
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
              : item.catalog === "academic-research-portal"
                ? "Academic Research Portal"
                : item.catalog === "community-events-portal"
                  ? "Community Events Portal"
                  : item.catalog === "cultural-heritage-archives"
                    ? "Cultural Heritage Archives"
                    : item.catalog === "historical-records"
                      ? "Historical Records"
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
          : item.dataset === "air-quality-measurements" || item.dataset === "environmental-data-air-quality-measurements"
            ? "Air Quality Measurements"
            : item.dataset === "gdp-growth-rates" || item.dataset === "economic-indicators-gdp-growth-rates"
              ? "GDP Growth Rates"
              : item.dataset === "environmental-data-water-quality-assessments"
                ? "Water Quality Assessments"
                : item.dataset === "environmental-data-climate-station-data"
                  ? "Climate Station Data"
                  : item.dataset === "economic-indicators-employment-statistics"
                    ? "Employment Statistics"
                    : item.dataset === "economic-indicators-consumer-price-index"
                      ? "Consumer Price Index"
                      : item.dataset === "academic-research-portal-research-study-results"
                        ? "Research Study Results"
                        : item.dataset === "academic-research-portal-survey-response-data"
                          ? "Survey Response Data"
                          : item.dataset === "community-events-portal-local-events-calendar"
                            ? "Local Events Calendar"
                            : item.dataset === "cultural-heritage-archives-performance-schedule"
                              ? "Performance Schedule"
                              : item.dataset === "cultural-heritage-archives-exhibition-archive"
                                ? "Exhibition Archive"
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
        !(this.payload.db.pool as { ended?: boolean }).ended
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
        (this.payload.db.drizzle as { $client?: { ended?: boolean } })
          .$client &&
        !(this.payload.db.drizzle as { $client?: { ended?: boolean } }).$client
          ?.ended
      ) {
        logger.debug("Closing drizzle client...");
        try {
          await Promise.race([
            (
              this.payload.db.drizzle as unknown as { end: () => Promise<void> }
            ).end(),
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

  private async findExistingItem(collection: string, item: Record<string, unknown>): Promise<any> {
    try {
      // Define unique identifiers for each collection
      let where: Record<string, any> = {};

      switch (collection) {
        case "users":
          if (item.email) {
            where.email = { equals: item.email };
          }
          break;
        case "catalogs":
          if (item.slug) {
            where.slug = { equals: item.slug };
          } else if (item.name) {
            where.name = { equals: item.name };
          }
          break;
        case "datasets":
          if (item.slug) {
            where.slug = { equals: item.slug };
          } else if (item.name) {
            where.name = { equals: item.name };
          }
          break;
        case "events":
          // For events, check by a combination of fields to avoid exact duplicates
          if (item.data && item.location) {
            where.and = [
              { "location.latitude": { equals: (item.location as any)?.latitude } },
              { "location.longitude": { equals: (item.location as any)?.longitude } },
            ];
          }
          break;
        case "imports":
          if (item.fileName) {
            where.fileName = { equals: item.fileName };
          }
          break;
        default:
          return null; // Skip existence check for unknown collections
      }

      if (Object.keys(where).length === 0) {
        return null; // No unique identifier found, can't check for existence
      }

      const existing = await this.payload!.find({
        collection: collection as keyof Config["collections"],
        where,
        limit: 1,
      });

      return existing.docs.length > 0 ? existing.docs[0] : null;
    } catch (error) {
      // If we can't check for existence, just proceed with creation
      logger.debug(`Could not check for existing ${collection} item:`, error);
      return null;
    }
  }

  private getDisplayName(item: any): string {
    return (
      item.name ||
      item.email ||
      item.fileName ||
      item.id ||
      "Unknown"
    );
  }
}

// Factory function for creating seed manager
export function createSeedManager(): SeedManager {
  return new SeedManager();
}
