/**
 * This file contains the `DataProcessing` class, which is responsible for preparing
 * and transforming seed data before it is inserted into the database.
 *
 * Its key responsibilities include:
 * - Determining the correct number of items to seed for a collection based on its configuration.
 * - Validating that the seed data and count are valid.
 * - Preparing the final seed dataset by either truncating or generating additional items as needed.
 * - Applying data transformations, such as custom generators or collection-specific options,
 *   to create more realistic and varied seed data.
 *
 * @module
 */
import { createLogger } from "@/lib/logger";

import { applyRealisticPatterns } from "../generators/realistic-patterns";
import { applySimplePatterns } from "../generators/simple-patterns";
import type { CollectionConfig } from "../seed.config";
import type { SeedData } from "../types";

const logger = createLogger("seed");

export class DataProcessing {
  determineCollectionCount(config: CollectionConfig, environment: string): number {
    const DEFAULT_COUNT = 5;

    try {
      if (typeof config.count === "number") {
        return config.count;
      }
      if (typeof config.count === "function") {
        return config.count(environment);
      }
      logger.debug(`No count configured for environment "${environment}", using default count of ${DEFAULT_COUNT}`);
      return DEFAULT_COUNT;
    } catch (error) {
      logger.warn(
        `Error determining collection count for environment "${environment}": ${error instanceof Error ? error.message : String(error)}. Using default count of ${DEFAULT_COUNT}`
      );
      return DEFAULT_COUNT;
    }
  }

  isValidCount(count: number, collectionName: string): boolean {
    if (count != null && count <= 0) {
      logger.warn(`Invalid count for ${collectionName}: ${count}. Using default count of 5.`);
      return false;
    }
    return true;
  }

  isValidSeedData(baseSeedData: SeedData | null, _collectionName: string): boolean {
    return baseSeedData != null && baseSeedData.length > 0;
  }

  prepareSeedData(baseSeedData: SeedData, count: number, collectionName: string): SeedData {
    let seedData = baseSeedData;

    // Limit data if we have more than needed
    if (Array.isArray(seedData) && seedData.length > count) {
      seedData = seedData.slice(0, count);
      logger.debug(`Limited ${collectionName} seed data to ${count} items`);
    }

    // Generate additional items if needed
    if (Array.isArray(seedData) && seedData.length < count) {
      const needed = count - seedData.length;
      const additional = this.generateAdditionalItems(seedData, needed, collectionName);
      seedData = [...seedData, ...additional] as SeedData;
      logger.debug(`Generated ${additional.length} additional ${collectionName} items`);
    }

    return seedData;
  }

  applyDataTransformations(seedData: SeedData, config: CollectionConfig, collectionName: string): SeedData {
    let transformedData = seedData;

    // Apply custom generator if specified
    if (config.customGenerator != null) {
      const randomSeed = config.options?.randomSeed as number | undefined;
      transformedData = this.applyCustomGenerator(transformedData, config.customGenerator, randomSeed);
    }

    // Apply collection-specific options
    if (config.options) {
      transformedData = this.applyCollectionOptions(transformedData, collectionName, config.options);
    }

    return transformedData;
  }

  generateTestSlug(originalSlug: unknown): string {
    const timestamp = Date.now();
    // Math.random is acceptable here as this is only for test seed data generation

    const random = Math.random().toString(36).substring(2, 8);

    if (typeof originalSlug === "string") {
      return `test-${originalSlug}-${timestamp}-${random}`;
    }
    return `test-slug-${timestamp}-${random}`;
  }

  private generateAdditionalItems(existingItems: SeedData, needed: number, collectionName: string): unknown[] {
    const additional: unknown[] = [];
    const itemsArray = Array.isArray(existingItems) ? existingItems : [];

    if (itemsArray.length === 0) return [];

    for (let i = 0; i < needed; i++) {
      const baseItem = itemsArray[i % itemsArray.length];
      const newItem = JSON.parse(JSON.stringify(baseItem)) as Record<string, unknown>;

      // Apply collection-specific variations
      this.applyCollectionSpecificVariations(newItem, i, collectionName);

      additional.push(newItem);
    }

    return additional;
  }

  private applyCustomGenerator(seedData: SeedData, generatorName: string, randomSeed?: number): SeedData {
    logger.debug(`Applying custom generator: ${generatorName}`);

    if (!Array.isArray(seedData)) {
      return seedData;
    }

    switch (generatorName) {
      case "simple-patterns": {
        // Simple patterns for test data
        return applySimplePatterns(seedData, { seed: randomSeed }) as SeedData;
      }

      case "realistic-temporal-spatial-patterns": {
        // Realistic patterns for development/demo data
        return applyRealisticPatterns(seedData, {
          seed: randomSeed,
          useGeographicClustering: true,
          temporalDistribution: "realistic",
        }) as SeedData;
      }

      default:
        logger.warn(`Unknown custom generator: ${generatorName}`);
        return seedData;
    }
  }

  private applyCollectionOptions(data: SeedData, collectionName: string, options: Record<string, unknown>): SeedData {
    switch (collectionName) {
      case "events":
        return this.applyEventsOptions(data, options);
      case "datasets":
        return this.applyDatasetsOptions(data, options);
      case "users":
        return this.applyUsersOptions(data, options);
      default:
        return data;
    }
  }

  private applyEventsOptions(data: SeedData, options: Record<string, unknown>): SeedData {
    let processedData = data;

    if (options.useGeographicClustering === false) {
      processedData = this.spreadEventsGeographically(processedData);
    }

    if (options.temporalDistribution === "uniform") {
      processedData = this.distributeEventsUniformly(processedData);
    }

    return processedData;
  }

  private spreadEventsGeographically(data: SeedData): SeedData {
    if (!Array.isArray(data)) return data;

    return data.map((item) => {
      const newItem =
        typeof item === "object" && item != null
          ? { ...(item as Record<string, unknown>) }
          : ({} as Record<string, unknown>);
      // Simple geographic spreading logic for seed data
      // Math.random is acceptable here as this is only for test data generation

      const lat = 40.7128 + (Math.random() - 0.5) * 0.2; // Around NYC

      const lng = -74.006 + (Math.random() - 0.5) * 0.2;

      if (typeof newItem === "object" && newItem != null) {
        newItem.latitude = lat;
        newItem.longitude = lng;
      }

      return newItem;
    }) as SeedData;
  }

  private distributeEventsUniformly(data: SeedData): SeedData {
    if (!Array.isArray(data)) return data;

    const now = new Date();
    const dayInMs = 24 * 60 * 60 * 1000;

    return data.map((item) => {
      const newItem =
        typeof item === "object" && item != null
          ? { ...(item as Record<string, unknown>) }
          : ({} as Record<string, unknown>);
      // Distribute events over the past 30 days
      // Math.random is acceptable here as this is only for test data generation

      const daysAgo = Math.random() * 30;
      const eventDate = new Date(now.getTime() - daysAgo * dayInMs);

      if (typeof newItem === "object" && newItem != null) {
        newItem.date = eventDate.toISOString();
      }

      return newItem;
    }) as SeedData;
  }

  private applyDatasetsOptions(data: SeedData, options: Record<string, unknown>): SeedData {
    if (options.generateSchemas === false) {
      // Logic to skip schema generation
    }
    return data;
  }

  private applyUsersOptions(data: SeedData, options: Record<string, unknown>): SeedData {
    if (options.includeTestUsers === false) {
      // Filter out test users
      return (
        Array.isArray(data)
          ? data.filter((user: unknown) => {
              const userObj = user as Record<string, unknown>;
              const email = userObj.email as string | undefined;
              return email != null ? !email.includes("test") : true;
            })
          : data
      ) as SeedData;
    }
    return data;
  }

  /**
   * Helper to check if a field exists and is a string.
   */
  private isStringField(obj: Record<string, unknown>, field: string): boolean {
    return obj[field] != null && typeof obj[field] === "string";
  }

  /**
   * Helper to append an index to a string field with a given separator.
   */
  private appendIndexToField(
    obj: Record<string, unknown>,
    field: string,
    index: number,
    separator: string = " "
  ): void {
    if (this.isStringField(obj, field)) {
      obj[field] = `${String(obj[field])}${separator}${index + 1}`;
    }
  }

  private applyCollectionSpecificVariations(
    newItem: Record<string, unknown>,
    index: number,
    collectionName: string
  ): void {
    switch (collectionName) {
      case "events":
        this.applyEventVariations(newItem, index);
        break;
      case "datasets":
        this.applyDatasetVariations(newItem, index);
        break;
      case "catalogs":
        this.applyCatalogVariations(newItem, index);
        break;
      case "users":
        this.applyUserVariations(newItem, index);
        break;
    }
  }

  private applyEventVariations(newItem: Record<string, unknown>, index: number): void {
    // Update uniqueId to ensure uniqueness for generated items
    if (typeof newItem.uniqueId === "string") {
      newItem.uniqueId = `${newItem.uniqueId}-gen-${index}`;
    }

    if (newItem.data != null) {
      const dataObj = newItem.data as Record<string, unknown>;
      this.appendIndexToField(dataObj, "address", index, " #");
    }
  }

  private applyDatasetVariations(newItem: Record<string, unknown>, index: number): void {
    this.appendIndexToField(newItem, "name", index);
    this.appendIndexToField(newItem, "slug", index, "-");
  }

  private applyCatalogVariations(newItem: Record<string, unknown>, index: number): void {
    this.appendIndexToField(newItem, "name", index);
    this.appendIndexToField(newItem, "slug", index, "-");
  }

  private applyUserVariations(newItem: Record<string, unknown>, index: number): void {
    if (this.isStringField(newItem, "email")) {
      const emailParts = (newItem.email as string).split("@");
      newItem.email = `${emailParts[0]}+${index + 1}@${emailParts[1]}`;
    }
    this.appendIndexToField(newItem, "firstName", index);
  }
}
