import { getPayload } from "payload";
import type { Where } from "payload";

import config from "../../payload.config";
import { createLogger, logError, logPerformance } from "../logger";
import { DatabaseOperations } from "./database-operations";
import { RelationshipResolver } from "./relationship-resolver";
import { getDependencyOrder } from "./relationship-config";
import {
  getCollectionConfig,
  getEnabledCollections,
  getEnvironmentSettings,
  type CollectionConfig,
} from "./seed.config";
import { catalogSeeds } from "./seeds/catalogs";
import type { CatalogSeed } from "./seeds/catalogs";
import { datasetSeeds } from "./seeds/datasets";
import type { DatasetSeed } from "./seeds/datasets";
import { eventSeeds } from "./seeds/events";
import type { EventSeed } from "./seeds/events";
import { importSeeds } from "./seeds/imports";
import type { ImportSeed } from "./seeds/imports";
import { mainMenuSeed } from "./seeds/main-menu";
import { pagesSeed } from "./seeds/pages";
import type { Config, Event, User, Dataset } from "../../payload-types";
import type { UserSeed } from "./seeds/users";
import { userSeeds } from "./seeds/users";

type SeedData =
  | UserSeed[]
  | CatalogSeed[]
  | DatasetSeed[]
  | EventSeed[]
  | ImportSeed[]
  | Config["globals"]["main-menu"][]
  | unknown[];

const logger = createLogger("seed");

export interface SeedOptions {
  collections?: string[];
  truncate?: boolean;
  environment?: "development" | "test" | "production" | "staging";
  /** Override configuration for specific collections */
  configOverrides?: Record<string, Partial<CollectionConfig>>;
  /** Use configuration-driven seeding */
  useConfig?: boolean;
}

export class SeedManager {
  private payload: Awaited<ReturnType<typeof getPayload>> | null;
  private relationshipResolver: RelationshipResolver | null;
  private databaseOperations: DatabaseOperations | null;
  private isCleaningUp = false;

  constructor() {
    this.payload = null;
    this.relationshipResolver = null;
    this.databaseOperations = null;
    this.isCleaningUp = false;
  }

  async initialize() {
    if (!this.payload) {
      logger.debug("Initializing Payload instance for seed manager");
      this.payload = await getPayload({
        config,
      });
      logger.debug("Payload instance initialized successfully");

      // Initialize relationship resolver
      this.relationshipResolver = new RelationshipResolver(this.payload);
      logger.debug("RelationshipResolver initialized");

      // Initialize database operations
      this.databaseOperations = new DatabaseOperations(this.payload);
      logger.debug("DatabaseOperations initialized");
    }
    return this.payload;
  }

  /**
   * Configuration-driven seeding
   * Uses the seed.config.ts to determine what to seed and how
   */
  async seedWithConfig(options: SeedOptions = {}) {
    const {
      environment = "development",
      truncate = false,
      configOverrides = {},
      collections: requestedCollections,
    } = options;

    await this.initialize();

    const envSettings = getEnvironmentSettings(environment);

    logger.info(
      { environment, settings: envSettings },
      `Starting configuration-driven seed process for ${environment} environment`,
    );
    const startTime = Date.now();

    // Get enabled collections for this environment in dependency order
    const enabledCollections = getEnabledCollections(environment);

    // Filter to requested collections if specified
    const collectionsToSeed = requestedCollections
      ? enabledCollections.filter((c) => requestedCollections.includes(c))
      : enabledCollections;

    logger.info(
      { enabled: enabledCollections, seeding: collectionsToSeed },
      `Collections determined by configuration`,
    );

    // Truncate collections if requested
    if (truncate) {
      await this.truncateCollections(collectionsToSeed);
    }

    // Seed each collection according to its configuration
    for (const collectionName of collectionsToSeed) {
      const config = getCollectionConfig(collectionName, environment);
      if (!config || config.disabled) {
        logger.debug(`Skipping disabled collection: ${collectionName}`);
        continue;
      }

      // Apply any config overrides
      const finalConfig = {
        ...config,
        ...configOverrides[collectionName],
        options: {
          ...config.options,
          ...configOverrides[collectionName]?.options,
        },
      };

      await this.seedCollectionWithConfig(
        collectionName,
        finalConfig,
        environment,
      );
    }

    const duration = Date.now() - startTime;
    logPerformance("Configuration-driven seed process", duration, {
      environment,
      collections: collectionsToSeed.length,
      settings: envSettings,
    });

    logger.info(
      { duration, collections: collectionsToSeed.length },
      `Configuration-driven seed process completed successfully`,
    );
  }

  /**
   * Legacy seeding method (maintains backward compatibility)
   */
  async seed(options: SeedOptions = {}) {
    // If useConfig is true, delegate to the new configuration-driven method
    if (options.useConfig) {
      return this.seedWithConfig(options);
    }
    const {
      collections = [
        "users",
        "catalogs",
        "datasets",
        "events",
        "imports",
        "main-menu",
        "pages",
      ],
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

    // Seed collections in dependency order (automatically calculated)
    const seedOrder = getDependencyOrder(collections);

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

  private async seedCollection(
    collectionOrGlobal: string,
    environment: string,
  ) {
    const seedData = await this.getSeedData(
      collectionOrGlobal as keyof Config["collections"],
      environment,
    );

    if (!seedData || seedData.length === 0) {
      logger.warn(`No seed data found for ${collectionOrGlobal}`);
      return;
    }

    if (collectionOrGlobal === "main-menu") {
      try {
        logger.info("Seeding main-menu global...");
        const menuData = Array.isArray(seedData) ? seedData[0] : seedData;
        await this.payload!.updateGlobal({
          slug: "main-menu",
          data: menuData as Config["globals"]["main-menu"],
        });
        logger.info("Seeded main-menu global successfully!");
      } catch (error) {
        logError(error, "Failed to seed main-menu global", {
          global: "main-menu",
          data: seedData[0],
        });
      }
      return;
    }

    const itemCount = Array.isArray(seedData) ? seedData.length : 1;
    logger.debug(
      { collection: collectionOrGlobal, count: itemCount },
      `Found ${itemCount} items to seed for ${collectionOrGlobal}`,
    );

    // Use the new relationship resolver for bulk resolution
    const resolvedSeedData =
      await this.relationshipResolver!.resolveCollectionRelationships(
        Array.isArray(seedData)
          ? (seedData as Record<string, unknown>[])
          : [seedData as Record<string, unknown>],
        collectionOrGlobal,
      );

    for (const resolvedItem of resolvedSeedData) {
      try {
        // For test environment, add timestamp to slug to ensure uniqueness
        if (environment === "test" && resolvedItem.slug) {
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          resolvedItem.slug = `${resolvedItem.slug}-${timestamp}-${randomSuffix}`;
        }

        // Check if item already exists to avoid duplicate key errors
        const existingItem = await this.findExistingItem(
          collectionOrGlobal,
          resolvedItem,
        );
        if (existingItem) {
          const displayName = this.getDisplayName(resolvedItem);
          logger.debug(
            { collection: collectionOrGlobal, displayName },
            `Skipping existing ${collectionOrGlobal} item: ${displayName}`,
          );
          continue;
        }

        await this.payload!.create({
          collection: collectionOrGlobal as keyof Config["collections"],
          data: resolvedItem,
        });

        // Get a display name for the item
        const displayName = this.getDisplayName(resolvedItem);
        logger.debug(
          { collection: collectionOrGlobal, displayName },
          `Created ${collectionOrGlobal} item: ${displayName}`,
        );
      } catch (error) {
        // Log the error but don't throw - allows graceful handling
        logError(error, `Failed to create ${collectionOrGlobal} item`, {
          collection: collectionOrGlobal,
          item: resolvedItem,
        });
      }
    }
  }

  /**
   * Seed a collection using configuration-driven approach
   */
  private async seedCollectionWithConfig(
    collectionName: string,
    config: CollectionConfig,
    environment: string,
  ) {
    logger.debug(
      { collection: collectionName, config },
      `Starting configuration-driven seeding for ${collectionName}`,
    );

    // Determine count using configuration
    const count =
      typeof config.count === "function"
        ? config.count(environment)
        : config.count || 0;

    if (count <= 0) {
      logger.debug(`Skipping ${collectionName}: count is ${count}`);
      return;
    }

    // Get base seed data
    const baseSeedData = await this.getSeedData(collectionName, environment);
    if (!baseSeedData || baseSeedData.length === 0) {
      logger.warn(`No seed data found for ${collectionName}`);
      return;
    }

    // Apply configuration-based adjustments
    let seedData = baseSeedData;

    // Limit to configured count if necessary
    if (Array.isArray(seedData) && seedData.length > count) {
      seedData = seedData.slice(0, count) as SeedData;
      logger.debug(
        `Limited ${collectionName} to ${count} items from ${Array.isArray(baseSeedData) ? baseSeedData.length : 0}`,
      );
    } else if (Array.isArray(seedData) && seedData.length < count) {
      // If we need more items than available, duplicate and modify existing ones
      const additional = this.generateAdditionalItems(
        seedData,
        Array.isArray(seedData) ? count - seedData.length : count,
        collectionName,
      );
      if (Array.isArray(seedData)) {
        seedData = [...seedData, ...additional] as SeedData;
      }
      logger.debug(
        `Extended ${collectionName} to ${count} items (${additional.length} generated)`,
      );
    }

    // Apply custom generator if specified
    if (config.customGenerator) {
      seedData = await this.applyCustomGenerator(
        seedData,
        config.customGenerator,
        config.options || {},
      );
    }

    // Apply collection-specific options
    if (config.options) {
      seedData = this.applyCollectionOptions(
        seedData,
        config.options,
        collectionName,
        environment,
      );
    }

    const seedCount = Array.isArray(seedData) ? seedData.length : 1;
    logger.info(
      {
        collection: collectionName,
        count: seedCount,
        config: config.options,
      },
      `Seeding ${collectionName} with ${seedCount} items using configuration`,
    );

    // Handle globals (like main-menu)
    if (collectionName === "main-menu") {
      try {
        const menuData = Array.isArray(seedData) ? seedData[0] : seedData;
        await this.payload!.updateGlobal({
          slug: "main-menu",
          data: menuData as Config["globals"]["main-menu"],
        });
        logger.info("Seeded main-menu global successfully!");
      } catch (error) {
        logError(error, "Failed to seed main-menu global", {
          global: "main-menu",
          data: seedData[0],
        });
      }
      return;
    }

    // Use the relationship resolver for bulk resolution
    const resolvedSeedData =
      await this.relationshipResolver!.resolveCollectionRelationships(
        Array.isArray(seedData)
          ? (seedData as Record<string, unknown>[])
          : [seedData as Record<string, unknown>],
        collectionName,
      );

    // Create items
    for (const resolvedItem of resolvedSeedData) {
      try {
        // For test environment, add timestamp to slug to ensure uniqueness
        if (environment === "test" && resolvedItem.slug) {
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          resolvedItem.slug = `${resolvedItem.slug}-${timestamp}-${randomSuffix}`;
        }

        // Check if item already exists to avoid duplicate key errors
        const existingItem = await this.findExistingItem(
          collectionName,
          resolvedItem,
        );
        if (existingItem) {
          const displayName = this.getDisplayName(resolvedItem);
          logger.debug(
            { collection: collectionName, displayName },
            `Skipping existing ${collectionName} item: ${displayName}`,
          );
          continue;
        }

        await this.payload!.create({
          collection: collectionName as keyof Config["collections"],
          data: resolvedItem,
        });

        const displayName = this.getDisplayName(resolvedItem);
        logger.debug(
          { collection: collectionName, displayName },
          `Created ${collectionName} item: ${displayName}`,
        );
      } catch (error) {
        logError(error, `Failed to create ${collectionName} item`, {
          collection: collectionName,
          item: resolvedItem,
          config,
        });
      }
    }

    logger.debug(
      `Completed configuration-driven seeding for ${collectionName}`,
    );
  }

  /**
   * Generate additional items when we need more than available in seed data
   */
  private generateAdditionalItems(
    existingItems: SeedData,
    needed: number,
    collectionName: string,
  ): unknown[] {
    const additional: Record<string, unknown>[] = [];

    // Ensure we have an array to work with
    const itemsArray = Array.isArray(existingItems) ? existingItems : [];
    if (itemsArray.length === 0) return [];

    for (let i = 0; i < needed; i++) {
      const baseItem = itemsArray[i % itemsArray.length];
      const newItem =
        typeof baseItem === "object" && baseItem !== null
          ? { ...baseItem }
          : { ...(baseItem as Record<string, unknown>) };

      // Make variations based on collection type
      switch (collectionName) {
        case "events": {
          const eventItem = newItem as unknown as Event;
          if (
            eventItem.data &&
            typeof eventItem.data === "object" &&
            eventItem.data !== null &&
            !Array.isArray(eventItem.data)
          ) {
            const dataObj = eventItem.data as Record<string, unknown>;
            if (dataObj.title && typeof dataObj.title === "string") {
              dataObj.title = `${dataObj.title} - Variant ${i + 1}`;
            }
            if (dataObj.address && typeof dataObj.address === "string") {
              dataObj.address = `${dataObj.address} - Unit ${i + 1}`;
            }
          }
          break;
        }
        case "datasets": {
          const datasetItem = newItem as unknown as Dataset;
          if (datasetItem.name) {
            datasetItem.name = `${datasetItem.name} - Extended ${i + 1}`;
          }
          if (datasetItem.slug) {
            datasetItem.slug = `${datasetItem.slug}-ext-${i + 1}`;
          }
          break;
        }
        case "catalogs": {
          const catalogItem = newItem as { name?: string; slug?: string };
          if (catalogItem.name) {
            catalogItem.name = `${catalogItem.name} - Branch ${i + 1}`;
          }
          if (catalogItem.slug) {
            catalogItem.slug = `${catalogItem.slug}-branch-${i + 1}`;
          }
          break;
        }
        case "users": {
          const userItem = newItem as unknown as User;
          if (userItem.email) {
            const [name, domain] = userItem.email.split("@");
            userItem.email = `${name}+${i + 1}@${domain}`;
          }
          if (userItem.firstName) {
            userItem.firstName = `${userItem.firstName}${i + 1}`;
          }
          break;
        }
      }

      additional.push(newItem);
    }

    return additional;
  }

  /**
   * Apply custom generator patterns
   */
  private async applyCustomGenerator(
    seedData: SeedData,
    generatorName: string,
    options: Record<string, unknown>,
  ): Promise<SeedData> {
    // This is where we would implement custom generators
    // For now, we'll return the data unchanged but log the intent
    logger.debug(
      { generator: generatorName, options },
      `Custom generator ${generatorName} requested (placeholder)`,
    );

    // TODO: Implement actual generators in a future enhancement
    // Examples: temporal patterns, spatial clustering, realistic distributions

    return seedData;
  }

  /**
   * Apply collection-specific options
   */
  private applyCollectionOptions(
    seedData: SeedData,
    options: Record<string, unknown>,
    collectionName: string,
    environment: string,
  ): SeedData {
    let modifiedData = [...seedData];

    // Apply environment-specific options
    getEnvironmentSettings(environment);

    // Collection-specific option handling
    switch (collectionName) {
      case "events":
        if (options.useGeographicClustering === false) {
          // Spread events more evenly (simplified approach)
          modifiedData = modifiedData.map((item) => {
            const event = item as Event;
            return {
              ...event,
              location: event.location
                ? {
                    ...event.location,
                    // Add small random offset to prevent perfect clustering
                    latitude:
                      (event.location.latitude || 0) +
                      (Math.random() - 0.5) * 0.1,
                    longitude:
                      (event.location.longitude || 0) +
                      (Math.random() - 0.5) * 0.1,
                  }
                : event.location,
            };
          }) as SeedData;
        }
        if (options.temporalDistribution === "uniform") {
          // Distribute events evenly over time
          modifiedData = modifiedData.map((item, index) => {
            const event = item as Event;
            return {
              ...event,
              eventTimestamp: new Date(
                Date.now() + index * 24 * 60 * 60 * 1000, // One event per day
              ),
            };
          }) as SeedData;
        }
        break;

      case "datasets":
        if (options.generateSchemas === false) {
          // Remove complex schema generation for faster testing
          modifiedData = modifiedData.map((item) => {
            const dataset = item as Dataset;
            return {
              ...dataset,
              schema: { type: "object", properties: {} }, // Minimal schema
            };
          }) as SeedData;
        }
        break;

      case "users":
        if (options.includeTestUsers === false) {
          // Filter out test users (users with test-related emails)
          modifiedData = modifiedData.filter((item) => {
            const user = item as User;
            return (
              !user.email?.includes("test") && !user.email?.includes("example")
            );
          });
        }
        break;
    }

    return modifiedData;
  }

  private async getSeedData(
    collectionOrGlobal: string,
    environment: string,
  ): Promise<SeedData> {
    switch (collectionOrGlobal) {
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
      case "main-menu":
        return [mainMenuSeed];
      case "pages":
        return pagesSeed;
      default:
        logger.warn(`Unknown collection or global: ${collectionOrGlobal}`);
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
    // imports references catalogs, events references datasets, datasets references catalogs
    const truncateOrder = [
      "imports", // First: imports references catalogs and datasets
      "events", // Second: events references datasets
      "datasets", // Third: datasets references catalogs
      "catalogs", // Fourth: catalogs (base dependency)
      "media", // Fifth: media (independent)
      "users", // Last: users (independent)
    ];

    for (const collection of truncateOrder) {
      if (collectionsToTruncate.has(collection)) {
        try {
          // Use efficient DatabaseOperations for truncation
          const result =
            await this.databaseOperations!.truncateCollectionEfficient(
              collection,
            );

          if (result.success) {
            logger.info(
              {
                collection,
                itemsDeleted: result.itemsProcessed,
                method: result.method,
                duration: `${result.duration.toFixed(2)}ms`,
              },
              `Efficiently truncated ${collection} using ${result.method}`,
            );
          } else {
            logger.warn(
              {
                collection,
                errors: result.errors?.length || 0,
                method: result.method,
              },
              `Truncation failed for ${collection}`,
            );

            // Log specific errors if available
            if (result.errors) {
              result.errors.forEach((error, index) => {
                logError(
                  error,
                  `Truncation error ${index + 1} for ${collection}`,
                );
              });
            }
          }
        } catch (error) {
          logError(error, `Failed to truncate ${collection}`, { collection });
        }
      }
    }
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

  private async findExistingItem(
    collection: string,
    item: Record<string, unknown>,
  ): Promise<unknown | null> {
    try {
      // Define unique identifiers for each collection
      const where: Where = {};

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
        case "events": {
          // For events, check by a combination of fields to avoid exact duplicates
          const eventItem = item as unknown as Event;
          if (eventItem.data && eventItem.location) {
            where.and = [
              {
                "location.latitude": {
                  equals: eventItem.location.latitude,
                },
              },
              {
                "location.longitude": {
                  equals: eventItem.location.longitude,
                },
              },
            ];
          }
          break;
        }
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

  private getDisplayName(item: Record<string, unknown>): string {
    return (
      (item.name as string) ||
      (item.email as string) ||
      (item.fileName as string) ||
      (item.id as string) ||
      "Unknown"
    );
  }
}

// Factory function for creating seed manager
export function createSeedManager(): SeedManager {
  return new SeedManager();
}
