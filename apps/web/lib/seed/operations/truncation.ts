/**
 * @module This file contains the `TruncationOperations` class, which is responsible for
 * clearing data from collections before seeding.
 *
 * It provides a robust and safe way to truncate collections by:
 * - Determining the correct order of operations to respect foreign key constraints.
 * - Automatically including dependent collections in the truncation process (e.g., truncating
 *   `datasets` will also truncate `events`).
 * - Using efficient database operations (like `TRUNCATE CASCADE`) with fallbacks to ensure
 *   data is cleared effectively.
 */
import { createLogger, logError, logPerformance } from "@/lib/logger";

import type { SeedManager } from "../seed-manager";

const logger = createLogger("seed");

export class TruncationOperations {
  constructor(private readonly seedManager: SeedManager) {}

  async truncate(collections: string[] = []) {
    await this.seedManager.initialize();
    logger.info("Starting truncation process");
    const startTime = Date.now();

    const collectionsToTruncate = this.addTruncationDependencies(collections);
    const truncateOrder = this.getTruncationOrder();

    let successCount = 0;
    for (const collection of truncateOrder) {
      if (collectionsToTruncate.has(collection)) {
        const success = await this.truncateCollection(collection);
        if (success) {
          successCount++;
        }
      }
    }

    logger.info(
      `Truncation completed: ${successCount}/${collectionsToTruncate.size} collections truncated successfully`,
    );

    logPerformance("Truncate process", Date.now() - startTime, {
      collections: Array.from(collectionsToTruncate),
    });
  }

  async truncateCollections(collections: string[]): Promise<void> {
    await this.truncate(collections);
  }

  private getAllCollectionNames(): string[] {
    return ["users", "catalogs", "datasets", "events", "import-files", "import-jobs", "main-menu", "pages"];
  }

  private addTruncationDependencies(collections: string[]): Set<string> {
    // If no collections specified, truncate all collections
    const collectionsToProcess = collections.length === 0 ? this.getAllCollectionNames() : collections;
    const collectionsToTruncate = new Set(collectionsToProcess);

    for (const collection of collectionsToProcess) {
      if (collection == "catalogs") {
        // When truncating catalogs, also truncate dependent collections
        collectionsToTruncate.add("datasets");
        collectionsToTruncate.add("events");
        collectionsToTruncate.add("import-files");
        collectionsToTruncate.add("import-jobs");
      }
      if (collection == "datasets") {
        // When truncating datasets, also truncate events
        collectionsToTruncate.add("events");
      }
    }

    return collectionsToTruncate;
  }

  private getTruncationOrder(): string[] {
    // Order matters for foreign key constraints
    // Truncate children before parents
    return [
      "events", // Has foreign keys to datasets and imports
      "import-jobs", // Has foreign key to import-files and datasets
      "import-files", // Has foreign key to catalogs
      "datasets", // Has foreign key to catalogs
      "catalogs", // Parent table
      "pages", // Independent
      "users", // May have foreign keys from other tables
    ];
  }

  private logTruncationResult(
    collection: string,
    result: { success: boolean; deletedCount?: number; errors?: unknown[] },
  ): void {
    const logData = {
      collection,
      success: result.success,
      deletedCount: result.deletedCount,
    };

    if (result.success) {
      logger.info(logData, `Successfully truncated ${collection}`);
    } else {
      logger.error(logData, `Failed to truncate ${collection}`);

      // Log individual errors if available
      if (result.errors != null && result.errors != undefined) {
        result.errors.forEach((error, index) => {
          logError(error, `Truncation error ${index + 1} for ${collection}`, { collection, errorIndex: index });
        });
      }
    }
  }

  private async truncateCollection(collection: string): Promise<boolean> {
    try {
      logger.debug(`Starting truncation of ${collection}`);

      const databaseOperations = this.seedManager.databaseOperationsInstance;
      if (!databaseOperations) {
        logError(new Error("DatabaseOperations not initialized"), `Failed to truncate ${collection}`, { collection });
        return false;
      }
      const result = await databaseOperations.truncateCollectionEfficient(collection);
      this.logTruncationResult(collection, result);

      return result.success;
    } catch (error: unknown) {
      logError(error, `Failed to truncate ${collection}`, { collection });
      return false;
    }
  }
}
