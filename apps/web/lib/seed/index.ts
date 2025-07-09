import { getPayload } from "payload";
import config from "../../payload.config";
import { userSeeds } from "./seeds/users";
import { catalogSeeds } from "./seeds/catalogs";
import { datasetSeeds } from "./seeds/datasets";
import { eventSeeds } from "./seeds/events";
import { importSeeds } from "./seeds/imports";

export interface SeedOptions {
  collections?: string[];
  truncate?: boolean;
  environment?: "development" | "test" | "production";
}

export class SeedManager {
  private payload: any;
  private isCleaningUp = false;

  constructor() {
    this.payload = null;
    this.isCleaningUp = false;
  }

  async initialize() {
    if (!this.payload) {
      this.payload = await getPayload({
        config,
      });
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

    console.log(`🌱 Starting seed process for ${environment} environment...`);

    // Truncate collections if requested
    if (truncate) {
      await this.truncateCollections(collections);
    }

    // Seed collections in dependency order
    const seedOrder = ["users", "catalogs", "datasets", "events", "imports"];

    for (const collection of seedOrder) {
      if (collections.includes(collection)) {
        console.log(`🌱 Seeding ${collection}...`);
        await this.seedCollection(collection, environment);
      }
    }

    console.log("✅ Seed process completed successfully!");
  }

  async truncate(collections: string[] = []) {
    await this.initialize();
    console.log("🗑️  Starting truncate process...");
    await this.truncateCollections(collections);
    console.log("✅ Truncate process completed!");
  }

  private async seedCollection(collection: string, environment: string) {
    const seedData = await this.getSeedData(collection, environment);

    if (!seedData || seedData.length === 0) {
      console.log(`⚠️  No seed data found for ${collection}`);
      return;
    }

    for (const item of seedData) {
      try {
        // Resolve relationships before creating
        const resolvedItem = await this.resolveRelationships(item, collection);

        await this.payload.create({
          collection,
          data: resolvedItem,
        });

        // Get a display name for the item
        const displayName =
          (item as any).name ||
          (item as any).email ||
          (item as any).id ||
          "Unknown";
        console.log(`✅ Created ${collection} item: ${displayName}`);
      } catch (error) {
        // Log the error but don't throw - allows graceful handling
        console.error(`❌ Failed to create ${collection} item:`, error);
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
        throw new Error(`Unknown collection: ${collection}`);
    }
  }

  private async truncateCollections(collections: string[]) {
    if (collections.length === 0) {
      // Get all collection names
      collections = [
        "users",
        "catalogs",
        "datasets",
        "events",
        "imports",
        "media",
      ];
    }

    // Define dependencies: collections that depend on others
    const dependencies = {
      datasets: ["catalogs"],
      events: ["datasets"],
      imports: ["datasets"],
    };

    // Build the complete list of collections to truncate, including dependencies
    const collectionsToTruncate = new Set(collections);

    // Add dependent collections that need to be truncated first
    for (const collection of collections) {
      if (collection === "catalogs") {
        // If truncating catalogs, also truncate all collections that depend on them
        collectionsToTruncate.add("datasets");
        collectionsToTruncate.add("events");
        collectionsToTruncate.add("imports");
      }
      if (collection === "datasets") {
        // If truncating datasets, also truncate collections that depend on them
        collectionsToTruncate.add("events");
        collectionsToTruncate.add("imports");
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
          const items = await this.payload.find({
            collection,
            limit: 1000,
            depth: 0,
          });

          for (const item of items.docs) {
            await this.payload.delete({
              collection,
              id: item.id,
            });
          }
          console.log(
            `🗑️  Truncated ${collection} (${items.docs.length} items)`,
          );
        } catch (error) {
          console.error(`❌ Failed to truncate ${collection}:`, error);
        }
      }
    }
  }

  private async resolveRelationships(
    item: any,
    collection: string,
  ): Promise<any> {
    const resolvedItem = { ...item };

    // Resolve catalog relationships
    if (item.catalog && typeof item.catalog === "string") {
      const catalog = await this.payload.find({
        collection: "catalogs",
        where: {
          slug: {
            equals: item.catalog,
          },
        },
        limit: 1,
      });

      if (catalog.docs.length > 0) {
        resolvedItem.catalog = catalog.docs[0].id;
      } else {
        console.error(`❌ Could not find catalog with slug: ${item.catalog}`);
        throw new Error(`Catalog not found: ${item.catalog}`);
      }
    }

    // Resolve dataset relationships
    if (item.dataset && typeof item.dataset === "string") {
      const dataset = await this.payload.find({
        collection: "datasets",
        where: {
          slug: {
            equals: item.dataset,
          },
        },
        limit: 1,
      });

      if (dataset.docs.length > 0) {
        resolvedItem.dataset = dataset.docs[0].id;
      } else {
        console.error(`❌ Could not find dataset with slug: ${item.dataset}`);
        throw new Error(`Dataset not found: ${item.dataset}`);
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
      console.log("Starting cleanup process...");

      // Try to close the database connection pool with timeout
      if (
        this.payload.db &&
        this.payload.db.pool &&
        !this.payload.db.pool.ended
      ) {
        console.log("Closing database pool...");
        try {
          await Promise.race([
            this.payload.db.pool.end(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Pool.end() timeout")), 3000),
            ),
          ]);
          console.log("Database pool closed successfully");
        } catch (poolError) {
          console.log(
            "Pool close timeout - skipping force closure to avoid double end",
          );
        }
      }

      // Try to close Drizzle client if it exists
      if (
        this.payload.db &&
        this.payload.db.drizzle &&
        this.payload.db.drizzle.$client &&
        !this.payload.db.drizzle.$client.ended
      ) {
        console.log("Closing drizzle client...");
        try {
          await Promise.race([
            this.payload.db.drizzle.$client.end(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Drizzle client.end() timeout")),
                2000,
              ),
            ),
          ]);
          console.log("Drizzle client closed successfully");
        } catch (drizzleError) {
          console.log("Drizzle client close timeout - continuing");
        }
      }

      // Try to destroy the database instance
      if (this.payload.db && typeof this.payload.db.destroy === "function") {
        console.log("Destroying database instance...");
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
          console.log("Database instance destroyed successfully");
        } catch (destroyError) {
          console.log("Database destroy timeout - continuing");
        }
      }

      // Clean up payload instance
      this.payload = null;
      console.log("Cleanup completed successfully");
    } catch (error) {
      console.error("Error during cleanup:", error);
      this.payload = null;
    } finally {
      this.isCleaningUp = false;
    }
  }

  async getCollectionCount(collection: string): Promise<number> {
    await this.initialize();
    const result = await this.payload.find({
      collection,
      limit: 0, // Only get count, not documents
    });
    return result.totalDocs;
  }
}

// Factory function for creating seed manager
export function createSeedManager(): SeedManager {
  return new SeedManager();
}
