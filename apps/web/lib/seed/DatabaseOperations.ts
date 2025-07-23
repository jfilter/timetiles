/**
 * DatabaseOperations - Phase 1.2 Completion
 *
 * Efficient bulk operations for the seeding system. Implements SQL TRUNCATE
 * with CASCADE fallback and batch operations for maximum performance.
 * This completes the missing piece from Phase 1.2 of the improvement plan.
 */

import type { Payload } from "payload";
import type { Config } from "../../payload-types";
import { createLogger, logError, logPerformance } from "../logger";

const logger = createLogger("db-operations");

export interface BatchOperationResult {
  success: boolean;
  itemsProcessed: number;
  duration: number;
  method: "sql-truncate" | "bulk-delete" | "batch-create";
  errors?: any[];
}

export class DatabaseOperations {
  constructor(private payload: Payload) {}

  /**
   * Efficiently truncate a collection using SQL TRUNCATE with CASCADE fallback
   */
  async truncateCollectionEfficient(
    collection: string,
  ): Promise<BatchOperationResult> {
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

      logger.warn(
        `SQL TRUNCATE failed for ${collection}, falling back to bulk delete`,
      );

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
   * Create multiple items efficiently using batch operations
   */
  async createMany<T>(
    collection: string,
    items: T[],
    batchSize: number = 100,
  ): Promise<BatchOperationResult> {
    if (items.length === 0) {
      return {
        success: true,
        itemsProcessed: 0,
        duration: 0,
        method: "batch-create",
      };
    }

    const startTime = performance.now();
    const results: T[] = [];
    const errors: any[] = [];

    logger.info(
      `Creating ${items.length} items in ${collection} with batch size ${batchSize}`,
    );

    // Process items in batches to avoid overwhelming the database
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchStartTime = performance.now();

      try {
        // Use Promise.allSettled to handle individual failures gracefully
        const batchPromises = batch.map(async (item) => {
          try {
            const created = await this.payload.create({
              collection: collection as keyof Config["collections"],
              data: item,
            });
            return { success: true, result: created };
          } catch (error) {
            return { success: false, error, item };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);

        // Process batch results
        batchResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            if (result.value.success) {
              results.push(result.value.result);
            } else {
              errors.push({
                batchIndex: Math.floor((i + index) / batchSize),
                itemIndex: i + index,
                error: result.value.error,
                item: result.value.item,
              });
            }
          } else {
            errors.push({
              batchIndex: Math.floor((i + index) / batchSize),
              itemIndex: i + index,
              error: result.reason,
            });
          }
        });

        const batchDuration = performance.now() - batchStartTime;
        logger.debug(`Batch ${Math.floor(i / batchSize) + 1} completed`, {
          itemsProcessed: batch.length,
          successes: batch.length - errors.length,
          failures: errors.length,
          duration: `${batchDuration.toFixed(2)}ms`,
        });
      } catch (batchError) {
        logError(batchError, `Batch creation failed for ${collection}`, {
          batchIndex: Math.floor(i / batchSize),
          itemsInBatch: batch.length,
        });

        errors.push({
          batchIndex: Math.floor(i / batchSize),
          error: batchError,
          itemsInBatch: batch.length,
        });
      }
    }

    const duration = performance.now() - startTime;
    const success = results.length > 0 && errors.length < items.length * 0.5; // Success if < 50% failures

    logPerformance(`Batch create ${collection}`, duration, {
      totalItems: items.length,
      successfulItems: results.length,
      failedItems: errors.length,
      batchSize,
    });

    if (errors.length > 0) {
      logger.warn(`Batch creation completed with ${errors.length} errors`, {
        collection,
        successRate: `${((results.length / items.length) * 100).toFixed(1)}%`,
      });
    }

    return {
      success,
      itemsProcessed: results.length,
      duration,
      method: "batch-create",
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Update multiple items efficiently
   */
  async updateMany<T>(
    collection: string,
    updates: Array<{ id: string | number; data: Partial<T> }>,
    batchSize: number = 50,
  ): Promise<BatchOperationResult> {
    const startTime = performance.now();
    const results: any[] = [];
    const errors: any[] = [];

    logger.info(`Updating ${updates.length} items in ${collection}`);

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      try {
        const batchPromises = batch.map(async ({ id, data }) => {
          try {
            const updated = await this.payload.update({
              collection: collection as keyof Config["collections"],
              id,
              data,
            });
            return { success: true, result: updated };
          } catch (error) {
            return { success: false, error, id, data };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            if (result.value.success) {
              results.push(result.value.result);
            } else {
              errors.push({
                itemIndex: i + index,
                error: result.value.error,
                id: result.value.id,
              });
            }
          } else {
            errors.push({
              itemIndex: i + index,
              error: result.reason,
            });
          }
        });
      } catch (batchError) {
        errors.push({
          batchIndex: Math.floor(i / batchSize),
          error: batchError,
        });
      }
    }

    const duration = performance.now() - startTime;
    const success = results.length > 0 && errors.length < updates.length * 0.5;

    return {
      success,
      itemsProcessed: results.length,
      duration,
      method: "batch-create", // Reusing the enum value
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get collection statistics efficiently
   */
  async getCollectionStats(collections: string[]): Promise<
    Record<
      string,
      {
        count: number;
        estimatedSize?: string;
        lastModified?: Date;
      }
    >
  > {
    const stats: Record<string, any> = {};

    const promises = collections.map(async (collection) => {
      try {
        const startTime = performance.now();

        // Get count efficiently
        const result = await this.payload.find({
          collection: collection as keyof Config["collections"],
          limit: 0, // Only get count
          depth: 0, // Minimal depth
        });

        const duration = performance.now() - startTime;

        stats[collection] = {
          count: result.totalDocs,
          queryTime: `${duration.toFixed(2)}ms`,
        };

        // Try to get additional statistics if possible
        try {
          if (this.payload.db?.drizzle) {
            // If using Drizzle, we might be able to get table stats
            const tableStats = await this.getTableStats(collection);
            stats[collection] = { ...stats[collection], ...tableStats };
          }
        } catch {
          // Ignore errors getting extended stats
          logger.debug(`Could not get extended stats for ${collection}`);
        }
      } catch (error) {
        stats[collection] = {
          count: -1,
          error: (error as any).message,
        };
      }
    });

    await Promise.allSettled(promises);
    return stats;
  }

  /**
   * SQL TRUNCATE with CASCADE - most efficient method
   */
  private async sqlTruncateWithCascade(collection: string): Promise<{
    success: boolean;
    itemsProcessed: number;
    errors?: any[];
  }> {
    try {
      // Check if we have direct database access
      if (
        !this.payload.db ||
        !this.payload.db.drizzle ||
        typeof this.payload.db.execute !== "function"
      ) {
        logger.debug(`No direct database access available for ${collection}`);
        return { success: false, itemsProcessed: 0 };
      }

      // Get initial count for reporting
      const initialCount = await this.getCollectionCount(collection);

      // Execute SQL TRUNCATE with CASCADE
      const tableName = `payload."${collection}"`;
      await this.payload.db.execute(
        `TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`,
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
        error: (error as any).message,
      });

      return {
        success: false,
        itemsProcessed: 0,
        errors: [error],
      };
    }
  }

  /**
   * Bulk delete fallback method
   */
  private async bulkDeleteCollection(collection: string): Promise<{
    success: boolean;
    itemsProcessed: number;
    errors?: any[];
  }> {
    const batchSize = 1000;
    let hasMore = true;
    let totalDeleted = 0;
    const errors: any[] = [];

    logger.info(
      `Starting bulk delete for ${collection} with batch size ${batchSize}`,
    );

    while (hasMore) {
      try {
        const items = await this.payload.find({
          collection: collection as keyof Config["collections"],
          limit: batchSize,
          select: { id: true }, // Only select ID for efficiency
          depth: 0,
        });

        if (items.docs.length === 0) {
          hasMore = false;
          break;
        }

        // Delete in batches using SQL if possible, otherwise use Payload API
        if (
          this.payload.db &&
          this.payload.db.drizzle &&
          typeof this.payload.db.execute === "function"
        ) {
          // Use SQL batch delete for efficiency
          const ids = items.docs.map((doc) => doc.id);
          try {
            await this.payload.db.execute(
              `DELETE FROM payload."${collection}" WHERE id = ANY($1)`,
              [ids],
            );
            totalDeleted += ids.length;
          } catch {
            // Fallback to individual deletes if SQL fails
            logger.debug(
              `SQL batch delete failed for ${collection}, falling back to individual deletes`,
            );
            const deleteResults = await this.fallbackIndividualDeletes(
              items.docs,
              collection,
            );
            totalDeleted += deleteResults.successful;
            errors.push(...deleteResults.errors);
          }
        } else {
          // Fallback to individual deletes
          const deletePromises = items.docs.map(async (item) => {
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
          const successful = results.filter(
            (r) => r.status === "fulfilled" && r.value.success,
          ).length;

          totalDeleted += successful;

          const failed = results.filter(
            (r) =>
              r.status === "rejected" ||
              (r.status === "fulfilled" && !r.value.success),
          );

          failed.forEach((failure, index) => {
            if (failure.status === "rejected") {
              errors.push({ error: failure.reason, itemIndex: index });
            } else if (failure.status === "fulfilled") {
              errors.push({
                error: (failure.value as any).error,
                id: (failure.value as any).id,
              });
            }
          });
        }

        hasMore = items.docs.length === batchSize;
      } catch (error) {
        logError(error, `Bulk delete batch failed for ${collection}`);
        errors.push(error);
        hasMore = false; // Stop on batch error
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
   * Get collection count efficiently
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
        error: (error as any).message,
      });
      return 0;
    }
  }

  /**
   * Fallback individual deletes when SQL batch fails
   */
  private async fallbackIndividualDeletes(
    items: any[],
    collection: string,
  ): Promise<{
    successful: number;
    errors: any[];
  }> {
    let successful = 0;
    const errors: any[] = [];

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
        if (result.value.success) {
          successful++;
        } else {
          errors.push({
            error: result.value.error,
            id: result.value.id,
          });
        }
      } else {
        errors.push({ error: result.reason, itemIndex: index });
      }
    });

    return { successful, errors };
  }

  /**
   * Get table statistics if using SQL database
   */
  private async getTableStats(collection: string): Promise<any> {
    try {
      if (!this.payload.db || typeof this.payload.db.execute !== "function") {
        return {};
      }

      // Try to get PostgreSQL table stats
      const query = `
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats 
        WHERE tablename = $1 AND schemaname = 'payload'
        LIMIT 5
      `;

      const result = await this.payload.db.execute(query, [collection]);

      return {
        hasStats: true,
        statsSample: result,
      };
    } catch {
      // Ignore stats errors
      return { hasStats: false };
    }
  }
}

/**
 * Convenience function to create DatabaseOperations instance
 */
export function createDatabaseOperations(payload: Payload): DatabaseOperations {
  return new DatabaseOperations(payload);
}
