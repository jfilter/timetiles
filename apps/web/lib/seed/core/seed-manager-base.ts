/**
 * This file contains the base class for the seed manager.
 *
 * The `SeedManagerBase` class is responsible for initializing the Payload CMS instance
 * and providing access to core database and relationship resolution services. It also
 * handles the graceful cleanup of database connections and other resources.
 *
 * This abstract class is extended by the main `SeedManager` to provide the core
 * foundation for all seeding operations.
 *
 * @module
 */
import type { Payload } from "payload";
import { getPayload } from "payload";

import { createPayloadConfig } from "@/lib/config/payload-config-factory";
import { createLogger } from "@/lib/logger";
import type { Config } from "@/payload-types";

import { DatabaseOperations } from "../database-operations";
import { RelationshipResolver } from "../relationship-resolver";

const logger = createLogger("seed");

export abstract class SeedManagerBase {
  protected payload: Payload | null;
  protected relationshipResolver: RelationshipResolver | null;
  protected databaseOperations: DatabaseOperations | null;
  protected isCleaningUp = false;

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
        config: await createPayloadConfig(),
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

  async cleanup() {
    if (this.isCleaningUp || !this.payload) {
      return;
    }

    this.isCleaningUp = true;

    try {
      logger.debug("Starting seed manager cleanup");

      // Add overall timeout protection for entire cleanup process
      const cleanupPromise = this.performCleanup();
      await Promise.race([
        cleanupPromise,
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("Cleanup process timeout after 30s")), 30000)
        ),
      ]);

      logger.debug("Seed manager cleanup completed");
    } catch (error: unknown) {
      logger.error("Error during cleanup", { error });
    } finally {
      this.isCleaningUp = false;
    }
  }

  private async performCleanup(): Promise<void> {
    // Close PostgreSQL connections if available
    await this.closePostgresConnections();

    // Close Drizzle connections if available
    this.closeDrizzleConnections();

    // Close Payload DB connections
    await this.closePayloadConnections();

    // Clean up Payload instance
    this.cleanupPayloadInstance();
  }

  private async closePostgresConnections(): Promise<void> {
    if (this.payload?.db?.pool != null && (this.payload.db.pool as { ended?: boolean }).ended !== true) {
      try {
        logger.debug("Closing PostgreSQL connection pool");
        const closePromise = (this.payload.db.pool as { end?: () => Promise<void> }).end?.();

        if (closePromise != null) {
          // Add timeout protection for connection pool closure
          await Promise.race([
            closePromise,
            new Promise((_resolve, reject) =>
              setTimeout(() => reject(new Error("PostgreSQL connection pool close timeout after 10s")), 10000)
            ),
          ]);
        }
        logger.debug("PostgreSQL connection pool closed");
      } catch (error: unknown) {
        // Connection pool will be cleaned up on process exit, so this is not critical
        logger.debug("PostgreSQL connection pool close error (non-critical)", { error });
      }
    }
  }

  private closeDrizzleConnections(): void {
    if (
      this.payload?.db?.drizzle != null &&
      typeof (this.payload.db.drizzle as unknown as { end?: () => void }).end == "function"
    ) {
      try {
        logger.debug("Closing Drizzle connection");
        (this.payload.db.drizzle as unknown as { end?: () => void }).end?.();
        logger.debug("Drizzle connection closed");
      } catch (error: unknown) {
        logger.warn("Error closing Drizzle connection", { error });
      }
    }
  }

  private async closePayloadConnections(): Promise<void> {
    if (this.payload?.db != null && this.payload.db != undefined && typeof this.payload.db.destroy == "function") {
      try {
        logger.debug("Closing Payload database connection");

        // Add timeout protection for Payload database connection closure
        await Promise.race([
          this.payload.db.destroy(),
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error("Payload database connection close timeout after 10s")), 10000)
          ),
        ]);
        logger.debug("Payload database connection closed");
      } catch (error: unknown) {
        logger.warn("Error closing Payload database connection", { error });
      }
    }
  }

  private cleanupPayloadInstance(): void {
    this.payload = null;
    this.relationshipResolver = null;
    this.databaseOperations = null;
  }

  async getCollectionCount(collection: string): Promise<number> {
    await this.initialize();
    const count = await this.payload!.count({
      collection: collection as keyof Config["collections"],
    });
    return count.totalDocs;
  }

  get payloadInstance() {
    return this.payload;
  }

  get relationshipResolverInstance() {
    return this.relationshipResolver;
  }

  get databaseOperationsInstance() {
    return this.databaseOperations;
  }
}
