import { getPayload } from "payload";
import type { Payload } from "payload";

import { DatabaseOperations } from "../database-operations";
import { RelationshipResolver } from "../relationship-resolver";

import { createLogger } from "@/lib/logger";
import type { Config } from "@/payload-types";
import config from "@/payload.config";
// import type { SeedOptions } from "../types";

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

  async cleanup() {
    if (this.isCleaningUp || !this.payload) {
      return;
    }

    this.isCleaningUp = true;

    try {
      logger.debug("Starting seed manager cleanup");

      // Close PostgreSQL connections if available
      await this.closePostgresConnections();

      // Close Drizzle connections if available
      this.closeDrizzleConnections();

      // Close Payload DB connections
      await this.closePayloadConnections();

      // Clean up Payload instance
      this.cleanupPayloadInstance();

      logger.debug("Seed manager cleanup completed");
    } catch (error: unknown) {
      logger.error("Error during cleanup", { error });
    } finally {
      this.isCleaningUp = false;
    }
  }

  private async closePostgresConnections(): Promise<void> {
    if (this.payload?.db?.pool != null && (this.payload.db.pool as { ended?: boolean }).ended !== true) {
      try {
        logger.debug("Closing PostgreSQL connection pool");
        await (this.payload.db.pool as { end?: () => Promise<void> }).end?.();
        logger.debug("PostgreSQL connection pool closed");
      } catch (error: unknown) {
        logger.warn("Error closing PostgreSQL connection pool", { error });
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
        await this.payload.db.destroy();
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
