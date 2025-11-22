/**
 * This file contains the `DatabaseOperations` class, which provides efficient
 * methods for performing bulk database operations during the seeding process.
 *
 * It is designed to maximize performance by using direct SQL commands like `TRUNCATE`
 * when possible, with fallbacks to Payload's API for broader compatibility. This
 * approach is particularly important for clearing collections before seeding new data.
 *
 * @module
 */

/**
 * DatabaseOperations.
 *
 * Efficient bulk operations for the seeding system. Implements SQL TRUNCATE
 * with CASCADE fallback and batch operations for maximum performance.
 * Efficient bulk operations for the seeding system.
 */

import type { Payload } from "payload";

import type { Config } from "@/payload-types";

import { createLogger, logError, logPerformance } from "../logger";

const logger = createLogger("db-operations");

export interface BatchOperationResult {
  success: boolean;
  itemsProcessed: number;
  duration: number;
  method: "sql-truncate" | "bulk-delete";
  errors?: unknown[];
}

export class DatabaseOperations {
  constructor(private readonly payload: Payload) {}

  /**
   * Efficiently truncate a collection using SQL TRUNCATE with CASCADE fallback.
   */
  async truncateCollectionEfficient(collection: string): Promise<BatchOperationResult> {
    const startTime = performance.now();
    logger.info(`Starting efficient truncation of ${collection}`);

    try {
      // First attempt: SQL TRUNCATE with CASCADE for maximum efficiency
      const sqlResult = await this.sqlTruncateWithCascade(collection);
      if (sqlResult.success) {
        const duration = performance.now() - startTime;
        logPerformance(`SQL TRUNCATE ${collection}`, duration);

        return {
          success: true,
          itemsProcessed: sqlResult.itemsProcessed,
          duration,
          method: "sql-truncate",
        };
      }

      logger.warn(`SQL TRUNCATE failed for ${collection}, falling back to bulk delete`);

      // Fallback: Bulk delete if TRUNCATE fails
      const bulkResult = await this.bulkDeleteCollection(collection);
      const duration = performance.now() - startTime;

      return {
        success: bulkResult.success,
        itemsProcessed: bulkResult.itemsProcessed,
        duration,
        method: "bulk-delete",
        errors: bulkResult.errors,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logError(error, `Efficient truncation failed for ${collection}`);

      return {
        success: false,
        itemsProcessed: 0,
        duration,
        method: "sql-truncate",
        errors: [error],
      };
    }
  }

  /**
   * SQL TRUNCATE with CASCADE - most efficient method.
   */
  private async sqlTruncateWithCascade(collection: string): Promise<{
    success: boolean;
    itemsProcessed: number;
    errors?: unknown[];
  }> {
    try {
      // Check if we have direct database access
      if (this.payload.db?.drizzle == null || typeof this.payload.db.execute !== "function") {
        logger.debug(`No direct database access available for ${collection}`);
        return { success: false, itemsProcessed: 0 };
      }

      // Get initial count for reporting
      const initialCount = await this.getCollectionCount(collection);

      // Execute SQL TRUNCATE with CASCADE
      const tableName = `payload."${collection}"`;
      await (this.payload.db as { execute: (query: string) => Promise<unknown> }).execute(
        `TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`
      );

      logger.info(`SQL TRUNCATE succeeded for ${collection}`, {
        itemsRemoved: initialCount,
        method: "SQL_TRUNCATE_CASCADE",
      });

      return {
        success: true,
        itemsProcessed: initialCount,
      };
    } catch (error) {
      logger.debug(`SQL TRUNCATE failed for ${collection}`, {
        error: (error as Error).message,
      });

      return {
        success: false,
        itemsProcessed: 0,
        errors: [error],
      };
    }
  }

  /**
   * Execute SQL batch delete.
   */
  private async executeSqlBatchDelete(
    collection: string,
    ids: string[]
  ): Promise<{ success: boolean; deletedCount: number }> {
    try {
      await (
        this.payload.db as {
          execute: (query: string, params: unknown[]) => Promise<unknown>;
        }
      ).execute(`DELETE FROM payload."${collection}" WHERE id = ANY($1)`, [ids]);
      return { success: true, deletedCount: ids.length };
    } catch {
      logger.debug(`SQL batch delete failed for ${collection}, falling back to individual deletes`);
      return { success: false, deletedCount: 0 };
    }
  }

  /**
   * Process individual deletes for a batch.
   */
  private async processIndividualDeletes(
    items: Array<{ id: string }>,
    collection: string
  ): Promise<{ successful: number; errors: unknown[] }> {
    const deletePromises = items.map(async (item) => {
      try {
        await this.payload.delete({
          collection: collection as keyof Config["collections"],
          id: item.id,
        });
        return { success: true };
      } catch (error) {
        return { success: false, error, id: item.id };
      }
    });

    const results = await Promise.allSettled(deletePromises);
    const successful = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
    const errors: unknown[] = [];

    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success));

    failed.forEach((failure, index) => {
      if (failure.status === "rejected") {
        errors.push({
          error: failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason)),
          itemIndex: index,
        });
      } else if (failure.status === "fulfilled") {
        errors.push({
          error: (failure.value as { error: unknown; id: unknown }).error,
          id: (failure.value as { error: unknown; id: unknown }).id,
        });
      }
    });

    return { successful, errors };
  }

  /**
   * Process a single batch of items for deletion.
   */
  private async processDeletionBatch(
    items: Array<{ id: string }>,
    collection: string
  ): Promise<{ deletedCount: number; errors: unknown[] }> {
    const errors: unknown[] = [];

    // Try SQL batch delete first if available
    if (this.payload.db?.drizzle != null && typeof this.payload.db.execute === "function") {
      const ids = items.map((doc) => doc.id);
      const sqlResult = await this.executeSqlBatchDelete(collection, ids);

      if (sqlResult.success) {
        return { deletedCount: sqlResult.deletedCount, errors };
      }

      // SQL failed, fallback to individual deletes
      const fallbackResult = await this.fallbackIndividualDeletes(
        items as unknown as Array<{ id: string }>,
        collection
      );
      return {
        deletedCount: fallbackResult.successful,
        errors: fallbackResult.errors,
      };
    }

    // Use individual deletes
    const result = await this.processIndividualDeletes(items, collection);
    return {
      deletedCount: result.successful,
      errors: result.errors,
    };
  }

  /**
   * Bulk delete fallback method.
   */
  private async bulkDeleteCollection(collection: string): Promise<{
    success: boolean;
    itemsProcessed: number;
    errors?: unknown[];
  }> {
    const batchSize = 1000;
    let hasMore = true;
    let totalDeleted = 0;
    const errors: unknown[] = [];

    logger.info(`Starting bulk delete for ${collection} with batch size ${batchSize}`);

    while (hasMore) {
      try {
        const items = await this.payload.find({
          collection: collection as keyof Config["collections"],
          limit: batchSize,
          depth: 0,
        });

        if (items.docs.length === 0) {
          break;
        }

        const batchResult = await this.processDeletionBatch(items.docs as unknown as Array<{ id: string }>, collection);
        totalDeleted += batchResult.deletedCount;
        errors.push(...batchResult.errors);

        hasMore = items.docs.length === batchSize;
      } catch (error) {
        logError(error, `Bulk delete batch failed for ${collection}`);
        errors.push(error);
        hasMore = false;
      }
    }

    const success = totalDeleted > 0;

    logger.info(`Bulk delete completed for ${collection}`, {
      itemsDeleted: totalDeleted,
      errors: errors.length,
    });

    return {
      success,
      itemsProcessed: totalDeleted,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get collection count efficiently.
   */
  private async getCollectionCount(collection: string): Promise<number> {
    try {
      const result = await this.payload.find({
        collection: collection as keyof Config["collections"],
        limit: 0,
        depth: 0,
      });
      return result.totalDocs;
    } catch (error) {
      logger.warn(`Could not get count for ${collection}`, {
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * Fallback individual deletes when SQL batch fails.
   */
  private async fallbackIndividualDeletes(
    items: { id: string | number }[],
    collection: string
  ): Promise<{
    successful: number;
    errors: unknown[];
  }> {
    let successful = 0;
    const errors: unknown[] = [];

    const deletePromises = items.map(async (item) => {
      try {
        await this.payload.delete({
          collection: collection as keyof Config["collections"],
          id: item.id,
        });
        return { success: true };
      } catch (error) {
        return { success: false, error, id: item.id };
      }
    });

    const results = await Promise.allSettled(deletePromises);

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        if (result.value.success === true) {
          successful++;
        } else {
          errors.push({
            error: result.value.error,
            id: result.value.id,
          });
        }
      } else {
        errors.push({
          error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
          itemIndex: index,
        });
      }
    });

    return { successful, errors };
  }
}
