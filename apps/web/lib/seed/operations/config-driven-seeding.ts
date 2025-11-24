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
import { createLogger } from "@/lib/logger";

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

interface OverallSeedResults {
  totalCreated: number;
  totalSkipped: number;
  totalFailed: number;
  collectionsProcessed: number;
  collectionsFailed: string[];
}

export class ConfigDrivenSeeding {
  constructor(private readonly seedManager: SeedManager) {}

  async seedWithConfig(options: SeedOptions = {}) {
    const {
      preset = "development",
      truncate = false,
      configOverrides = {},
      collections: requestedCollections,
      exitOnFailure = true,
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

    const overallResults = await this.processCollections(collectionsToSeed, configOverrides, preset);

    this.logSeedCompletion(startTime, collectionsToSeed, preset, presetConfig, overallResults);

    // Exit with error code if there were failures
    if (overallResults.totalFailed > 0 || overallResults.collectionsFailed.length > 0) {
      const errorMessage = `Seeding failed: ${overallResults.totalFailed} items failed, ${overallResults.collectionsFailed.length} collections failed: ${overallResults.collectionsFailed.join(", ")}`;
      logger.error("Seeding completed with failures");

      if (exitOnFailure) {
        process.exit(1);
      }

      throw new Error(errorMessage);
    }
  }

  private logSeedStart(preset: string, _presetConfig: PresetConfig): number {
    logger.info({ preset }, `Starting seed process for ${preset} preset`);
    return Date.now();
  }

  private determineCollectionsToSeed(preset: string, requestedCollections?: string[]): string[] {
    const enabledCollections = getEnabledCollections(preset);
    const collectionsToSeed = requestedCollections
      ? enabledCollections.filter((c) => requestedCollections.includes(c))
      : enabledCollections;

    logger.info(`Seeding ${collectionsToSeed.length} collections: ${collectionsToSeed.join(", ")}`);
    return collectionsToSeed;
  }

  private async processCollections(
    collectionsToSeed: string[],
    configOverrides: Record<string, Partial<CollectionConfig>>,
    preset: string
  ): Promise<OverallSeedResults> {
    const overallResults: OverallSeedResults = {
      totalCreated: 0,
      totalSkipped: 0,
      totalFailed: 0,
      collectionsProcessed: 0,
      collectionsFailed: [],
    };

    for (const collectionName of collectionsToSeed) {
      const config = getCollectionConfig(collectionName, preset);
      if (config == null || config == undefined || config.disabled === true) {
        logger.debug(`Skipping disabled collection: ${collectionName}`);
        continue;
      }

      const finalConfig = this.applyConfigOverrides(config, configOverrides, collectionName);

      try {
        const result = await this.seedManager.seedCollectionWithConfig(collectionName, finalConfig, preset);

        // Track results (null means global collection or invalid config)
        if (result) {
          overallResults.totalCreated += result.created;
          overallResults.totalSkipped += result.skipped;
          overallResults.totalFailed += result.failed;
          overallResults.collectionsProcessed++;

          // Track collections with failures
          if (result.failed > 0) {
            overallResults.collectionsFailed.push(collectionName);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error({ collection: collectionName }, `Failed to seed collection ${collectionName}: ${errorMsg}`);
        overallResults.collectionsFailed.push(collectionName);
      }
    }

    return overallResults;
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
    _preset: string,
    _presetConfig: PresetConfig,
    overallResults: OverallSeedResults
  ): void {
    const duration = Date.now() - startTime;

    // Log overall summary
    logger.info(
      {
        duration,
        collections: collectionsToSeed.length,
        created: overallResults.totalCreated,
        skipped: overallResults.totalSkipped,
        failed: overallResults.totalFailed,
        processed: overallResults.collectionsProcessed,
      },
      `Seed completed in ${(duration / 1000).toFixed(1)}s: ${overallResults.totalCreated} created, ${overallResults.totalSkipped} skipped, ${overallResults.totalFailed} failed`
    );

    // Warn about collections with failures
    if (overallResults.collectionsFailed.length > 0) {
      logger.warn(
        { failedCollections: overallResults.collectionsFailed },
        `${overallResults.collectionsFailed.length} collection(s) had failures: ${overallResults.collectionsFailed.join(", ")}`
      );
    }
  }
}
