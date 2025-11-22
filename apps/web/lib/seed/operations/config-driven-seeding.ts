/**
 * This file contains the `ConfigDrivenSeeding` class, which implements the logic
 * for the configuration-driven seeding process.
 *
 * It is responsible for:
 * - Reading the seed configuration for a given environment.
 * - Determining which collections to seed based on the configuration and user-provided options.
 * - Orchestrating the seeding process by calling the appropriate methods on the `SeedManager`
 *   for each collection, applying any configuration overrides.
 * - Logging the start and completion of the seeding process.
 *
 * @module
 */
import { createLogger, logPerformance } from "@/lib/logger";

import {
  type CollectionConfig,
  getCollectionConfig,
  getEnabledCollections,
  type PresetConfig,
  SEED_CONFIG,
} from "../seed.config";
import type { SeedManager } from "../seed-manager";
import type { SeedOptions } from "../types";

const logger = createLogger("seed");

export class ConfigDrivenSeeding {
  constructor(private readonly seedManager: SeedManager) {}

  async seedWithConfig(options: SeedOptions = {}) {
    const {
      preset = "development",
      truncate = false,
      configOverrides = {},
      collections: requestedCollections,
    } = options;

    await this.seedManager.initialize();
    const presetConfig = SEED_CONFIG.presets[preset];

    if (!presetConfig) {
      throw new Error(`Unknown preset: ${preset}`);
    }

    const startTime = this.logSeedStart(preset, presetConfig);

    const collectionsToSeed = this.determineCollectionsToSeed(preset, requestedCollections);

    if (truncate) {
      await this.seedManager.truncateCollections(collectionsToSeed);
    }

    await this.processCollections(collectionsToSeed, configOverrides, preset);

    this.logSeedCompletion(startTime, collectionsToSeed, preset, presetConfig);
  }

  private logSeedStart(preset: string, presetConfig: PresetConfig): number {
    logger.info({ preset, config: presetConfig }, `Starting configuration-driven seed process for ${preset} preset`);
    return Date.now();
  }

  private determineCollectionsToSeed(preset: string, requestedCollections?: string[]): string[] {
    const enabledCollections = getEnabledCollections(preset);
    const collectionsToSeed = requestedCollections
      ? enabledCollections.filter((c) => requestedCollections.includes(c))
      : enabledCollections;

    logger.info({ enabled: enabledCollections, seeding: collectionsToSeed }, `Collections determined by configuration`);
    return collectionsToSeed;
  }

  private async processCollections(
    collectionsToSeed: string[],
    configOverrides: Record<string, Partial<CollectionConfig>>,
    preset: string
  ): Promise<void> {
    for (const collectionName of collectionsToSeed) {
      const config = getCollectionConfig(collectionName, preset);
      if (config == null || config == undefined || config.disabled === true) {
        logger.debug(`Skipping disabled collection: ${collectionName}`);
        continue;
      }

      const finalConfig = this.applyConfigOverrides(config, configOverrides, collectionName);
      await this.seedManager.seedCollectionWithConfig(collectionName, finalConfig, preset);
    }
  }

  private applyConfigOverrides(
    config: CollectionConfig,
    configOverrides: Record<string, Partial<CollectionConfig>>,
    collectionName: string
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
    preset: string,
    presetConfig: PresetConfig
  ): void {
    const duration = Date.now() - startTime;
    logPerformance("Configuration-driven seed process", duration, {
      preset,
      collections: collectionsToSeed.length,
      config: presetConfig,
    });

    logger.info(
      { duration, collections: collectionsToSeed.length },
      `Configuration-driven seed process completed successfully`
    );
  }
}
