/**
 * This file contains the main `SeedManager` class, which serves as the primary
 * entry point and orchestrator for all database seeding operations.
 *
 * It extends `SeedManagerBase` to inherit core functionalities like Payload initialization
 * and cleanup. This class composes various specialized operation classes to handle
 * different aspects of the seeding process:
 * - `ConfigDrivenSeeding`: For seeding based on the `seed.config.ts` file.
 * - `SeedingOperations`: For the core logic of creating documents and handling relationships.
 *
 * Truncation is handled via `lib/database/operations.ts` for consistency across the application.
 *
 * It exposes high-level methods like `seedWithConfig` and `truncate` that can be called
 * from seed scripts or other parts of the application.
 *
 * @module
 */
import type { Payload } from "payload";

import { createDatabaseClient } from "../database/client";
import { truncateTables } from "../database/operations";
import { getDatabaseUrl } from "../database/url";
import { createLogger } from "../logger";
import { SeedManagerBase } from "./core/seed-manager-base";
import { ConfigDrivenSeeding } from "./operations/config-driven-seeding";
import { SeedingOperations, type SeedResult } from "./operations/seeding-operations";
import type { CollectionConfig } from "./seed.config";
import type { SeedOptions } from "./types";

const logger = createLogger("seed");
const truncatableTableCache = new Map<string, string[]>();

const assertSafeIdentifier = (value: string, pattern: RegExp, type: string): void => {
  if (!pattern.test(value)) {
    throw new Error(`Invalid ${type}: ${value}`);
  }
};

const toQualifiedCollectionTableName = (collection: string): string => {
  assertSafeIdentifier(collection, /^[a-z0-9-]+$/, "collection name");
  return `payload."${collection.replaceAll("-", "_")}"`;
};

const toQualifiedTableName = (tableName: string): string => {
  assertSafeIdentifier(tableName, /^[a-z0-9_]+$/, "table name");
  return `payload."${tableName}"`;
};

const executeTruncateWithPayloadConnection = async (payload: Payload, tableList: string): Promise<boolean> => {
  const db = payload.db as { execute?: (query: string) => Promise<unknown> };
  if (typeof db.execute !== "function") {
    return false;
  }

  // Set lock_timeout to fail fast instead of waiting for idle-in-transaction
  // connections that hold locks. The caller's fallback path handles failure.
  await db.execute(`SET LOCAL lock_timeout = '5s'`);
  await db.execute(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
  return true;
};

const getTruncatableTableNames = async (connectionString: string): Promise<string[]> => {
  const cachedTableNames = truncatableTableCache.get(connectionString);
  if (cachedTableNames) {
    return cachedTableNames;
  }

  const client = createDatabaseClient({ connectionString });
  try {
    await client.connect();

    const result = await client.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE $2
        ORDER BY table_name
      `,
      ["payload", "payload_migrations%"]
    );

    const tableNames = result.rows.map((row) => row.table_name as string);
    truncatableTableCache.set(connectionString, tableNames);
    return tableNames;
  } finally {
    await client.end();
  }
};

export class SeedManager extends SeedManagerBase {
  private readonly configDrivenSeeding: ConfigDrivenSeeding;
  private readonly seedingOperations: SeedingOperations;
  private currentOptions: SeedOptions = {};

  constructor() {
    super();
    this.configDrivenSeeding = new ConfigDrivenSeeding(this);
    this.seedingOperations = new SeedingOperations(this);
  }

  /**
   * Configuration-driven seeding
   * Uses the seed.config.ts to determine what to seed and how.
   */
  async seedWithConfig(options: SeedOptions = {}) {
    this.currentOptions = options;
    return this.configDrivenSeeding.seedWithConfig(options);
  }

  /**
   * Get current seeding options.
   */
  get options(): SeedOptions {
    return this.currentOptions;
  }

  /**
   * Truncate collections before seeding.
   *
   * Uses PostgreSQL TRUNCATE CASCADE to automatically handle foreign key dependencies.
   * If no collections specified, truncates all tables (except migrations).
   *
   * @param collections - Optional array of collection names to truncate. If empty, truncates all.
   *
   * @example
   * ```typescript
   * await seedManager.truncate(); // Truncate all tables
   * await seedManager.truncate(['users', 'catalogs']); // Truncate only users and catalogs (+ their dependents via CASCADE)
   * ```
   */
  async truncate(collections: string[] = []): Promise<void> {
    await this.initialize();

    const dbUrl = getDatabaseUrl(true);
    if (!dbUrl) {
      throw new Error("DATABASE_URL is required for truncation");
    }

    const payload = this.payload!;

    if (collections.length === 0) {
      // Truncate all tables
      logger.info("Truncating all tables");

      try {
        const tableNames = await getTruncatableTableNames(dbUrl);
        if (tableNames.length === 0) {
          return;
        }

        const tableList = tableNames.map(toQualifiedTableName).join(", ");
        const usedPayloadConnection = await executeTruncateWithPayloadConnection(payload, tableList);

        if (usedPayloadConnection) {
          logger.info(`Truncated ${tableNames.length} tables successfully`);
          return;
        }
      } catch (error) {
        logger.warn("Falling back to direct truncateTables()", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const tableCount = await truncateTables(dbUrl, { schema: "payload", excludePatterns: ["payload_migrations%"] });
      logger.info(`Truncated ${tableCount} tables successfully`);
    } else {
      // Truncate specific collections using direct SQL with CASCADE
      logger.info({ collections }, "Truncating specific collections");

      const tableList = collections.map(toQualifiedCollectionTableName).join(", ");

      try {
        const usedPayloadConnection = await executeTruncateWithPayloadConnection(payload, tableList);
        if (usedPayloadConnection) {
          logger.info({ collections }, `Truncated ${collections.length} collections successfully`);
          return;
        }
      } catch (error) {
        logger.warn("Falling back to dedicated truncate client for collections", {
          collections,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const client = createDatabaseClient({ connectionString: dbUrl });
      try {
        await client.connect();
        await client.query(`SET LOCAL lock_timeout = '10s'`);
        await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
        logger.info({ collections }, `Truncated ${collections.length} collections successfully`);
      } finally {
        await client.end();
      }
    }
  }

  async truncateCollections(collections: string[]): Promise<void> {
    return this.truncate(collections);
  }

  async seedCollectionWithConfig(
    collectionName: string,
    config: CollectionConfig,
    environment: string
  ): Promise<SeedResult | null> {
    return this.seedingOperations.seedCollectionWithConfig(collectionName, config, environment);
  }
}

export const createSeedManager = (): SeedManager => new SeedManager();
