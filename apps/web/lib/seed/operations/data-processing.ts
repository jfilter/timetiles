// import { logError } from "../../logger";
import type { CollectionConfig } from "../seed.config";
import type { SeedData } from "../types";

import { createLogger } from "@/lib/logger";

const logger = createLogger("seed");

export class DataProcessing {
  determineCollectionCount(config: CollectionConfig, environment: string): number {
    if (typeof config.count === "number") {
      return config.count;
    }
    if (typeof config.count === "object" && config.count !== null) {
      const envCount = (config.count as Record<string, unknown>)[environment];
      if (typeof envCount === "number") return envCount;
      if (typeof (config.count as Record<string, unknown>).default === "number") {
        return (config.count as Record<string, unknown>).default as number;
      }
    }
    return 5;
  }

  isValidCount(count: number, collectionName: string): boolean {
    if (count != null && count <= 0) {
      logger.warn(`Invalid count for ${collectionName}: ${count}. Using default count of 5.`);
      return false;
    }
    return true;
  }

  isValidSeedData(baseSeedData: SeedData | null, collectionName: string): boolean {
    if (baseSeedData == null || baseSeedData.length === 0) {
      logger.warn(`No seed data available for ${collectionName}`);
      return false;
    }
    return true;
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
      seedData = [...seedData, ...additional];
      logger.debug(`Generated ${additional.length} additional ${collectionName} items`);
    }

    return seedData;
  }

  applyDataTransformations(seedData: SeedData, config: CollectionConfig, collectionName: string): SeedData {
    let transformedData = seedData;

    // Apply custom generator if specified
    if (config.customGenerator != null) {
      transformedData = this.applyCustomGenerator(transformedData, config.customGenerator);
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
    // eslint-disable-next-line sonarjs/pseudo-random
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

  private applyCustomGenerator(seedData: SeedData, generatorName: string): SeedData {
    logger.debug(`Applying custom generator: ${generatorName}`);

    // Custom generators would be implemented here
    // For now, just return the original data
    logger.warn(`Unknown custom generator: ${generatorName}`);
    return seedData;
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
        typeof item === "object" && item !== null
          ? { ...(item as Record<string, unknown>) }
          : ({} as Record<string, unknown>);
      // Simple geographic spreading logic for seed data
      // Math.random is acceptable here as this is only for test data generation
      // eslint-disable-next-line sonarjs/pseudo-random
      const lat = 40.7128 + (Math.random() - 0.5) * 0.2; // Around NYC
      // eslint-disable-next-line sonarjs/pseudo-random
      const lng = -74.006 + (Math.random() - 0.5) * 0.2;

      if (typeof newItem === "object" && newItem != null) {
        newItem.latitude = lat;
        newItem.longitude = lng;
      }

      return newItem;
    });
  }

  private distributeEventsUniformly(data: SeedData): SeedData {
    if (!Array.isArray(data)) return data;

    const now = new Date();
    const dayInMs = 24 * 60 * 60 * 1000;

    return data.map((item) => {
      const newItem =
        typeof item === "object" && item !== null
          ? { ...(item as Record<string, unknown>) }
          : ({} as Record<string, unknown>);
      // Distribute events over the past 30 days
      // Math.random is acceptable here as this is only for test data generation
      // eslint-disable-next-line sonarjs/pseudo-random
      const daysAgo = Math.random() * 30;
      const eventDate = new Date(now.getTime() - daysAgo * dayInMs);

      if (typeof newItem === "object" && newItem != null) {
        newItem.date = eventDate.toISOString();
      }

      return newItem;
    });
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
      return Array.isArray(data)
        ? data.filter((user: unknown) => {
            const userObj = user as Record<string, unknown>;
            const email = userObj.email as string | undefined;
            return email != null ? !email.includes("test") : true;
          })
        : data;
    }
    return data;
  }

  private applyCollectionSpecificVariations(
    newItem: Record<string, unknown>,
    index: number,
    collectionName: string,
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
    const eventItem = newItem;
    if (eventItem.data != null) {
      const dataObj = eventItem.data as Record<string, unknown>;
      if (dataObj.address !== null && dataObj.address !== undefined && typeof dataObj.address === "string") {
        dataObj.address = `${dataObj.address} #${index + 1}`;
      }
    }
  }

  private applyDatasetVariations(newItem: Record<string, unknown>, index: number): void {
    const datasetItem = newItem;
    if (datasetItem.name !== null && datasetItem.name !== undefined) {
      datasetItem.name = `${String(datasetItem.name as string)} ${index + 1}`;
    }
    if (datasetItem.slug !== null && datasetItem.slug !== undefined) {
      datasetItem.slug = `${String(datasetItem.slug as string)}-${index + 1}`;
    }
  }

  private applyCatalogVariations(newItem: Record<string, unknown>, index: number): void {
    const catalogItem = newItem;
    if (catalogItem.name !== null && catalogItem.name !== undefined) {
      catalogItem.name = `${String(catalogItem.name as string)} ${index + 1}`;
    }
    if (catalogItem.slug !== null && catalogItem.slug !== undefined) {
      catalogItem.slug = `${String(catalogItem.slug as string)}-${index + 1}`;
    }
  }

  private applyUserVariations(newItem: Record<string, unknown>, index: number): void {
    const userItem = newItem;
    if (userItem.email != null && typeof userItem.email === "string") {
      const emailParts = userItem.email.split("@");
      userItem.email = `${emailParts[0]}+${index + 1}@${emailParts[1]}`;
    }
    if (userItem.firstName !== null && userItem.firstName !== undefined) {
      userItem.firstName = `${String(userItem.firstName as string)} ${index + 1}`;
    }
  }
}
