/**
 * @module This file contains the `ConfigDrivenSeeding` class, which implements the logic
 * for the configuration-driven seeding process.
 *
 * It is responsible for:
 * - Reading the seed configuration for a given environment.
 * - Determining which collections to seed based on the configuration and user-provided options.
 * - Orchestrating the seeding process by calling the appropriate methods on the `SeedManager`
 *   for each collection, applying any configuration overrides.
 * - Logging the start and completion of the seeding process.
 */
import { createLogger } from "@/lib/logger";
import { logPerformance } from "@/lib/logger";

import {
  type CollectionConfig,
  getCollectionConfig,
  getEnabledCollections,
  getEnvironmentSettings,
} from "../seed.config";
import type { SeedManager } from "../seed-manager";
import type { SeedOptions } from "../types";

const logger = createLogger("seed");

export class ConfigDrivenSeeding {
  constructor(private readonly seedManager: SeedManager) {}

  async seedWithConfig(options: SeedOptions = {}) {
    const {
      environment = "development",
      truncate = false,
      configOverrides = {},
      collections: requestedCollections,
    } = options;

    await this.seedManager.initialize();
    const envSettings = getEnvironmentSettings(environment);
    const startTime = this.logSeedStart(environment, envSettings);

    const collectionsToSeed = this.determineCollectionsToSeed(environment, requestedCollections);

    if (truncate) {
      await this.seedManager.truncateCollections(collectionsToSeed);
    }

    await this.processCollections(collectionsToSeed, configOverrides, environment);

    this.logSeedCompletion(startTime, collectionsToSeed, environment, envSettings);
  }

  private logSeedStart(environment: string, envSettings: unknown): number {
    logger.info(
      { environment, settings: envSettings },
      `Starting configuration-driven seed process for ${environment} environment`,
    );
    return Date.now();
  }

  private determineCollectionsToSeed(environment: string, requestedCollections?: string[]): string[] {
    const enabledCollections = getEnabledCollections(environment);
    const collectionsToSeed = requestedCollections
      ? enabledCollections.filter((c) => requestedCollections.includes(c))
      : enabledCollections;

    logger.info({ enabled: enabledCollections, seeding: collectionsToSeed }, `Collections determined by configuration`);
    return collectionsToSeed;
  }

  private async processCollections(
    collectionsToSeed: string[],
    configOverrides: Record<string, Partial<CollectionConfig>>,
    environment: string,
  ): Promise<void> {
    for (const collectionName of collectionsToSeed) {
      const config = getCollectionConfig(collectionName, environment);
      if (config == null || config == undefined || config.disabled === true) {
        logger.debug(`Skipping disabled collection: ${collectionName}`);
        continue;
      }

      const finalConfig = this.applyConfigOverrides(config, configOverrides, collectionName);
      await this.seedManager.seedCollectionWithConfig(collectionName, finalConfig, environment);
    }
  }

  private applyConfigOverrides(
    config: CollectionConfig,
    configOverrides: Record<string, Partial<CollectionConfig>>,
    collectionName: string,
  ): CollectionConfig {
    return {
      ...config,
      ...(typeof collectionName == "string" && Object.hasOwn(configOverrides, collectionName)
        ? configOverrides[collectionName]
        : {}),
      options: {
        ...config.options,
        ...(typeof collectionName == "string" && Object.hasOwn(configOverrides, collectionName)
          ? configOverrides[collectionName]?.options
          : {}),
      },
    };
  }

  private logSeedCompletion(
    startTime: number,
    collectionsToSeed: string[],
    environment: string,
    envSettings: unknown,
  ): void {
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
}
