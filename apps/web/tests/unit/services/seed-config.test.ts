/**
 * Unit tests for seed configuration and seed data functions.
 *
 * These tests verify pure functions and configuration objects
 * without requiring a database connection.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { getCollectionConfig, getEnabledCollections, SEED_CONFIG } from "../../../lib/seed/seed.config";
import { catalogSeeds } from "../../../lib/seed/seeds/catalogs";
import { datasetSeeds } from "../../../lib/seed/seeds/datasets";
import { eventSeeds } from "../../../lib/seed/seeds/events";
import { userSeeds } from "../../../lib/seed/seeds/users";

describe("Seed Data Functions", () => {
  it("should generate user seeds for different environments", () => {
    const devUsers = userSeeds("development");
    const prodUsers = userSeeds("production");

    // Development should have more users than production
    expect(devUsers.length).toBeGreaterThan(prodUsers.length);
    // All users should have required fields
    expect(devUsers.every((user) => user.email && user.password)).toBe(true);
    expect(prodUsers.every((user) => user.email && user.password)).toBe(true);
  });

  it("should generate catalog seeds for different environments", () => {
    const devCatalogs = catalogSeeds("development");
    const prodCatalogs = catalogSeeds("production");

    // Development should have more catalogs than production
    expect(devCatalogs.length).toBeGreaterThan(prodCatalogs.length);
    // All catalogs should have required fields
    expect(devCatalogs.every((catalog) => catalog.name && catalog.slug)).toBe(true);
    expect(prodCatalogs.every((catalog) => catalog.name && catalog.slug)).toBe(true);
  });

  it("should generate dataset seeds for different environments", () => {
    const devDatasets = datasetSeeds("development");
    const prodDatasets = datasetSeeds("production");

    // Development should have more datasets than production
    expect(devDatasets.length).toBeGreaterThan(prodDatasets.length);
    // All datasets should have required fields
    expect(devDatasets.every((dataset) => dataset.name && dataset.slug)).toBe(true);
    expect(prodDatasets.every((dataset) => dataset.name && dataset.slug)).toBe(true);
  });

  it("should generate event seeds for different environments", () => {
    const devEvents = eventSeeds("development");
    const prodEvents = eventSeeds("production");

    // Development should have more events than production
    expect(devEvents.length).toBeGreaterThan(prodEvents.length);
    // All events should have required fields
    expect(devEvents.every((event) => event.dataset && event.originalData)).toBe(true);
    expect(prodEvents.every((event) => event.dataset && event.originalData)).toBe(true);
  });
});

describe("Configuration System", () => {
  it("should provide correct collection configurations for different environments", () => {
    const devCatalogsConfig = getCollectionConfig("catalogs", "development");
    expect(devCatalogsConfig).toBeDefined();
    expect(typeof devCatalogsConfig?.count).toBe("function");
    if (devCatalogsConfig) {
      expect((devCatalogsConfig.count as (...args: any[]) => any)("development")).toBe(12);
    }

    const testCatalogsConfig = getCollectionConfig("catalogs", "testing");
    expect(testCatalogsConfig).toBeDefined();
    if (testCatalogsConfig) {
      expect((testCatalogsConfig.count as (...args: any[]) => any)("testing")).toBe(3);
    }

    const e2eCatalogsConfig = getCollectionConfig("catalogs", "e2e");
    expect(e2eCatalogsConfig).toBeDefined();
    if (e2eCatalogsConfig) {
      expect((e2eCatalogsConfig.count as (...args: any[]) => any)("e2e")).toBe(8);
    }
  });

  it("should return null for disabled collections", () => {
    const mediaConfig = getCollectionConfig("media", "testing");
    expect(mediaConfig).toBeDefined();
    expect(mediaConfig?.disabled).toBe(true);
  });

  it("should throw for unknown presets", () => {
    expect(() => getCollectionConfig("events", "unknown-preset")).toThrow("Unknown preset: unknown-preset");
  });

  it("should provide enabled collections in dependency order", () => {
    const devCollections = getEnabledCollections("development");
    expect(devCollections).toContain("users");
    expect(devCollections).toContain("catalogs");
    expect(devCollections).toContain("datasets");
    expect(devCollections).toContain("events");

    const catalogsIndex = devCollections.indexOf("catalogs");
    const datasetsIndex = devCollections.indexOf("datasets");
    const eventsIndex = devCollections.indexOf("events");

    expect(catalogsIndex).toBeLessThan(datasetsIndex);
    expect(datasetsIndex).toBeLessThan(eventsIndex);
  });

  it("should handle circular dependency detection", () => {
    expect(() => getEnabledCollections("development")).not.toThrow();
    expect(() => getEnabledCollections("testing")).not.toThrow();
    expect(() => getEnabledCollections("e2e")).not.toThrow();
  });

  it("should provide preset-specific settings", () => {
    const devPreset = SEED_CONFIG.presets.development!;
    expect(devPreset.volume).toBe("large");
    expect(devPreset.realism).toBe("realistic");
    expect(devPreset.debugging).toBe("verbose");

    const testPreset = SEED_CONFIG.presets.testing!;
    expect(testPreset.volume).toBe("small");
    expect(testPreset.realism).toBe("simple");
    expect(testPreset.performance).toBe("fast");

    const e2ePreset = SEED_CONFIG.presets.e2e!;
    expect(e2ePreset.volume).toBe("medium");
    expect(e2ePreset.realism).toBe("realistic");
  });
});

describe("Configuration Validation", () => {
  it("should have all required presets with valid configurations", () => {
    const requiredPresets = ["testing", "e2e", "development"];

    requiredPresets.forEach((preset) => {
      expect(SEED_CONFIG.presets[preset]).toBeDefined();
      const presetConfig = SEED_CONFIG.presets[preset];

      if (!presetConfig) {
        throw new Error(`Preset config for ${preset} is undefined`);
      }

      expect(typeof presetConfig).toBe("object");
      expect(presetConfig).toHaveProperty("enabled");
      expect(Array.isArray(presetConfig.enabled)).toBe(true);
      expect(presetConfig.enabled.length).toBeGreaterThan(0);
      expect(presetConfig).toHaveProperty("volume");
      expect(presetConfig).toHaveProperty("realism");
      expect(presetConfig).toHaveProperty("performance");
      expect(presetConfig).toHaveProperty("debugging");
    });

    expect(Object.keys(SEED_CONFIG.presets)).toHaveLength(3);

    const devPreset = SEED_CONFIG.presets.development;
    if (!devPreset) {
      throw new Error("Development preset is undefined");
    }

    expect(devPreset.enabled).toContain("users");
    expect(devPreset.enabled).toContain("catalogs");
    expect(devPreset.enabled).toContain("events");
    expect(devPreset.volume).toBe("large");
    expect(devPreset.realism).toBe("realistic");
  });

  it("should have valid collection configurations with proper counts", () => {
    Object.entries(SEED_CONFIG.collections).forEach(([, config]) => {
      expect(config).toBeDefined();
      expect(typeof config).toBe("object");

      if (!config.disabled) {
        expect(config.count).toBeDefined();
        const countType = typeof config.count;
        expect(["number", "function"]).toContain(countType);

        if (countType === "function") {
          const devCount = (config.count as (env: string) => number)("development");
          expect(typeof devCount).toBe("number");
          expect(devCount).toBeGreaterThanOrEqual(0);
        } else {
          expect(config.count as number).toBeGreaterThan(0);
        }
      }

      if (config.dependencies) {
        expect(Array.isArray(config.dependencies)).toBe(true);

        config.dependencies.forEach((dep) => {
          expect(typeof dep).toBe("string");
          expect(dep.length).toBeGreaterThan(0);
          expect(SEED_CONFIG.collections).toHaveProperty(dep);
        });
      }
    });
  });

  it("should have valid collection names that match Payload collections", () => {
    const validCollections = [
      "users",
      "catalogs",
      "datasets",
      "events",
      "sites",
      "views",
      "pages",
      "media",
      "location-cache",
      "geocoding-providers",
      "scheduled-ingests",
      "ingest-files",
      "ingest-jobs",
      "scraper-repos",
      "scrapers",
      "scraper-runs",
    ];

    Object.keys(SEED_CONFIG.collections).forEach((collectionName) => {
      expect(validCollections).toContain(collectionName);
    });
  });

  it("should include main-menu in all presets", () => {
    const allPresets = ["testing", "e2e", "development"];

    allPresets.forEach((preset) => {
      const enabledCollections = getEnabledCollections(preset);
      expect(enabledCollections).toContain("main-menu");
    });
  });

  it("should configure main-menu as a static global with count of 1", () => {
    const mainMenuConfig = getCollectionConfig("main-menu", "development");

    expect(mainMenuConfig).toBeDefined();
    expect(mainMenuConfig?.count).toBe(1);
    expect(mainMenuConfig?.dependencies).toEqual([]);
    expect(mainMenuConfig?.options?.staticContent).toBe(true);
  });

  it("should have valid dependency graph without circular dependencies", () => {
    Object.entries(SEED_CONFIG.collections).forEach(([collectionName, config]) => {
      if (config.dependencies) {
        expect(config.dependencies).not.toContain(collectionName);
      }
    });
  });
});
