/**
 * This file defines the centralized configuration for the database seeding system.
 *
 * It provides a structured way to manage all aspects of seeding, including:
 * - How many documents to create for each collection, with environment-specific counts.
 * - Which collections are enabled or disabled for different environments (e.g., development, test).
 * - The dependency order between collections to ensure data integrity.
 * - Overrides for specific collections in different environments.
 * - Configuration for custom data generators to create more realistic seed data.
 *
 * This configuration-driven approach makes the seeding process flexible, maintainable,
 * and easy to adapt for various scenarios.
 *
 * @module
 */

/**
 * Configuration-Driven Seeding System.
 *
 * This configuration file centralizes all seeding behavior, making it easy to:
 * - Control collection counts per environment
 * - Define dependencies between collections
 * - Enable/disable collections per environment
 * - Override behavior with environment-specific settings
 * - Configure custom data generators.
 */

import { COLLECTION_GEOCODING_PROVIDERS, FOOTER_SLUG, MAIN_MENU_SLUG, SETTINGS_SLUG } from "./constants";
import type { RelationshipConfig } from "./relationship-config";
import { RELATIONSHIP_CONFIG } from "./relationship-config";

const getLocationCacheCount = (preset: string): number => {
  switch (preset) {
    case "development":
      return 50;
    case "e2e":
      return 20;
    case "testing":
      return 10;
    default:
      throw new Error(`Unknown preset: ${preset}. Valid presets: testing, e2e, development`);
  }
};

export interface CollectionConfig {
  /** Number of items to create, or function returning count based on environment */
  count?: number | ((env: string) => number);
  /** Collections that must be seeded before this one */
  dependencies?: string[];
  /** Custom generator to use for realistic data patterns */
  customGenerator?: string;
  /** Whether this collection is disabled */
  disabled?: boolean;
  /** Collection-specific options */
  options?: Record<string, unknown>;
}

export interface GeneratorConfig {
  /** Type of generator (temporal, spatial, etc.) */
  type: "temporal" | "spatial" | "realistic" | "custom";
  /** Generator-specific options */
  options: Record<string, unknown>;
}

/** Valid preset names. `deploy` is idempotent on-boot bootstrap; the others run via `pnpm seed`. */
export type PresetName = "testing" | "e2e" | "development" | "deploy";

/**
 * Preset configuration - bundles together related settings for a specific use case.
 */
export interface PresetConfig {
  /** Human-readable description of this preset */
  description: string;
  /** Collections enabled for this preset */
  enabled: string[];
  /** How much data to generate */
  volume: "small" | "medium" | "large";
  /** How realistic/complex the data should be */
  realism: "simple" | "realistic";
  /** Performance vs richness trade-off */
  performance: "fast" | "balanced" | "rich";
  /** Logging verbosity */
  debugging: "quiet" | "normal" | "verbose";
  /** Preset-specific overrides for collection configurations */
  overrides?: Record<string, Partial<CollectionConfig>>;
}

export interface SeedConfiguration {
  /** Configuration for each collection */
  collections: Record<string, CollectionConfig>;
  /** Configuration for globals */
  globals?: Record<string, CollectionConfig>;
  /** Relationship configurations (imported from existing system) */
  relationships: Record<string, RelationshipConfig[]>;
  /** Seeding presets */
  presets: Record<string, PresetConfig>;
  /** Custom data generators */
  generators: Record<string, GeneratorConfig>;
}

export const SEED_CONFIG: SeedConfiguration = {
  collections: {
    // Users - foundational data
    users: {
      count: (preset) => {
        switch (preset) {
          case "development":
            return 15;
          case "e2e":
            return 5;
          case "testing":
            return 3;
          default:
            throw new Error(`Unknown preset: ${preset}. Valid presets: testing, e2e, development`);
        }
      },
      dependencies: [],
      options: { includeTestUsers: true, createAdminUser: true },
    },

    // Catalogs - organizational structure
    catalogs: {
      count: (preset) => {
        switch (preset) {
          case "development":
            return 12; // Expanded for local development
          case "e2e":
            return 8; // All catalog types for E2E tests
          case "testing":
            return 3; // Base catalogs only
          default:
            throw new Error(`Unknown preset: ${preset}. Valid presets: testing, e2e, development`);
        }
      },
      dependencies: [],
      options: { includeArchivedCatalogs: false },
    },

    // Datasets - depend on catalogs
    datasets: {
      count: (preset) => {
        switch (preset) {
          case "development":
            return 30; // Expanded for local development (2-3 per catalog)
          case "e2e":
            return 18; // 2-3 per catalog for E2E tests
          case "testing":
            return 9; // 3 per base catalog
          default:
            throw new Error(`Unknown preset: ${preset}. Valid presets: testing, e2e, development`);
        }
      },
      dependencies: ["catalogs"],
      options: { includeArchivedDatasets: false, generateSchemas: true },
    },

    // Events - depend on datasets, high volume
    events: {
      count: (preset) => {
        switch (preset) {
          case "development":
            return 1000; // Rich dataset for development
          case "e2e":
            return 500; // Moderate dataset for E2E tests
          case "testing":
            return 50; // Sufficient for testing
          default:
            throw new Error(`Unknown preset: ${preset}. Valid presets: testing, e2e, development`);
        }
      },
      dependencies: ["catalogs", "datasets"],
      customGenerator: "realistic-temporal-spatial-patterns",
      options: { useGeographicClustering: true, temporalDistribution: "realistic", includeGeocoding: true },
    },

    // Sites - multi-domain configuration
    sites: {
      count: 1, // Default site
      dependencies: [],
      options: { staticContent: true },
    },

    // Views - UI configuration per site
    views: {
      count: 1, // Default view per site
      dependencies: ["sites"],
      options: { staticContent: true },
    },

    // Pages - static content (home, about, contact, terms, privacy)
    pages: { count: 5, dependencies: ["sites"], options: { staticContent: true } },

    // Scheduled ingests - recurring URL imports (development only)
    "scheduled-ingests": { count: 5, dependencies: ["users", "catalogs"] },

    // Ingest files - manual file uploads (development only)
    "ingest-files": { count: 5, dependencies: ["users"] },

    // Ingest jobs - import processing records (development only)
    "ingest-jobs": { count: 6, dependencies: ["users", "ingest-files", "datasets"] },

    // Scraper repos - scraper source code repositories (development only)
    "scraper-repos": { count: 2, dependencies: ["users", "catalogs"] },

    // Scrapers - individual scraper definitions (development only)
    scrapers: { count: 3, dependencies: ["scraper-repos"] },

    // Scraper runs - scraper execution history (development only)
    "scraper-runs": { count: 8, dependencies: ["scrapers"] },

    // Media - support files
    media: {
      count: (preset) => (preset === "development" ? 10 : 0),
      dependencies: [],
      disabled: true, // Disable for now, complex file handling
    },

    // Location cache - geocoding support
    "location-cache": {
      count: (preset) => getLocationCacheCount(preset),
      dependencies: [],
      options: { includeCommonLocations: true },
    },

    // Geocoding providers - service configuration
    [COLLECTION_GEOCODING_PROVIDERS]: {
      count: (preset) => {
        switch (preset) {
          case "development":
          case "deploy":
            return 3;
          case "e2e":
          case "testing":
            return 1;
          default:
            throw new Error(`Unknown preset: ${preset}. Valid presets: testing, e2e, development, deploy`);
        }
      },
      dependencies: [],
      options: { includeTestProviders: true },
    },
  },

  // Globals configuration
  globals: {
    // Main Menu - global navigation
    [MAIN_MENU_SLUG]: {
      count: 1, // Single global menu
      dependencies: [],
      options: { staticContent: true },
    },
    // Footer - global footer content
    [FOOTER_SLUG]: {
      count: 1, // Single global footer
      dependencies: [],
      options: { staticContent: true },
    },
    // Settings - legal notices, feature flags, etc.
    [SETTINGS_SLUG]: {
      count: 1, // Single global settings
      dependencies: [],
      options: { staticContent: true },
    },
  },

  // Import existing relationship configurations
  relationships: RELATIONSHIP_CONFIG,

  generators: {
    "realistic-temporal-spatial-patterns": {
      type: "temporal",
      options: {
        // Temporal patterns
        seasonality: true,
        weekdayBias: 0.7, // 70% weekday events
        timeOfDayDistribution: "business-hours", // Peak during business hours
        holidayAvoidance: true,

        // Spatial patterns
        geographicClustering: true,
        clusters: 5,
        clusterRadius: 10, // 10km radius
        outlierRate: 0.1, // 10% outliers

        // Realism features
        eventTypeBias: true, // Different types have different patterns
        capacityRealism: true, // Realistic venue capacities
        coordinateAccuracy: "realistic", // Some coordinate uncertainty
      },
    },

    "simple-patterns": {
      type: "realistic",
      options: {
        // Simplified for fast test execution
        seasonality: false,
        weekdayBias: 0.5, // No bias
        timeOfDayDistribution: "uniform",
        geographicClustering: false,
        coordinateAccuracy: "precise",
      },
    },

    "geographic-clustering": {
      type: "spatial",
      options: {
        clusters: 3,
        clusterRadius: 15, // km
        outlierRate: 0.15,
        centerPoints: [
          { latitude: 40.7128, longitude: -74.006 }, // NYC
          { latitude: 37.7749, longitude: -122.4194 }, // SF
          { latitude: 41.8781, longitude: -87.6298 }, // Chicago
        ],
      },
    },
  },

  // Seeding presets - only 3 supported: testing, e2e, development
  presets: {
    testing: {
      description: "Fast, deterministic data for unit/integration tests",
      enabled: [
        "users",
        "catalogs",
        "datasets",
        "events",
        "sites",
        "views",
        "pages",
        MAIN_MENU_SLUG,
        FOOTER_SLUG,
        SETTINGS_SLUG,
      ],
      volume: "small",
      realism: "simple",
      performance: "fast",
      debugging: "quiet",
      overrides: {
        events: {
          customGenerator: "simple-patterns",
          options: { useGeographicClustering: false, temporalDistribution: "uniform", includeGeocoding: false },
        },
        datasets: {
          options: { generateSchemas: false }, // Faster test execution
        },
      },
    },

    e2e: {
      description: "Moderate, realistic data for E2E UI testing",
      enabled: [
        "users",
        "catalogs",
        "datasets",
        "events",
        "sites",
        "views",
        "pages",
        MAIN_MENU_SLUG,
        FOOTER_SLUG,
        SETTINGS_SLUG,
        COLLECTION_GEOCODING_PROVIDERS,
      ],
      volume: "medium",
      realism: "realistic",
      performance: "balanced",
      debugging: "normal",
      overrides: {
        events: {
          count: 100, // Enough to test UI, not too slow
          customGenerator: "realistic-temporal-spatial-patterns",
        },
      },
    },

    development: {
      description: "Rich, realistic data for local development",
      enabled: [
        "users",
        "catalogs",
        "datasets",
        "events",
        "sites",
        "views",
        "pages",
        MAIN_MENU_SLUG,
        FOOTER_SLUG,
        SETTINGS_SLUG,
        COLLECTION_GEOCODING_PROVIDERS,
        "scheduled-ingests",
        "ingest-files",
        "ingest-jobs",
        "scraper-repos",
        "scrapers",
        "scraper-runs",
      ],
      volume: "large",
      realism: "realistic",
      performance: "rich",
      debugging: "verbose",
      overrides: {
        events: {
          customGenerator: "realistic-temporal-spatial-patterns",
          options: {
            useGeographicClustering: true,
            temporalDistribution: "realistic",
            includeGeocoding: true,
            debugOutput: true,
          },
        },
        datasets: { options: { includeArchivedDatasets: true, generateExtendedSchemas: true } },
      },
    },

    // Deploy: idempotent on-boot bootstrap for staging/production/dev. Skip-if-exists per
    // record (slug/name) and per-global (isEmpty check). The full seed array is used as-is —
    // count is irrelevant in idempotent mode.
    deploy: {
      description: "Idempotent on-boot bootstrap for deployments and local dev",
      enabled: ["sites", "views", "pages", MAIN_MENU_SLUG, FOOTER_SLUG, SETTINGS_SLUG, COLLECTION_GEOCODING_PROVIDERS],
      volume: "small",
      realism: "simple",
      performance: "fast",
      debugging: "quiet",
    },
  },
};

/**
 * Get configuration for a specific collection or global and preset.
 * @param collection - Collection name
 * @param preset - Preset name
 */
export const getCollectionConfig = (collection: string, preset: string): CollectionConfig | null => {
  // Check collections first, then globals
  let baseConfig: CollectionConfig | undefined;
  if (Object.hasOwn(SEED_CONFIG.collections, collection)) {
    baseConfig = SEED_CONFIG.collections[collection];
  } else if (SEED_CONFIG.globals && Object.hasOwn(SEED_CONFIG.globals, collection)) {
    baseConfig = SEED_CONFIG.globals[collection];
  }

  if (baseConfig == null) return null;

  // Get preset configuration
  const presetConfig = SEED_CONFIG.presets[preset];
  if (!presetConfig) {
    throw new Error(`Unknown preset: ${preset}`);
  }

  // Check if collection is enabled
  if (!presetConfig.enabled.includes(collection)) {
    // For disabled collections, still return the config
    if (baseConfig.disabled === true) {
      return baseConfig;
    }
    return null;
  }

  // Apply overrides
  const overrides = presetConfig.overrides?.[collection] ?? {};

  return { ...baseConfig, ...overrides, options: { ...baseConfig.options, ...overrides.options } };
};

/**
 * Get all enabled collections for a preset in dependency order.
 * @param preset - Preset name
 */
export const getEnabledCollections = (preset: string): string[] => {
  const presetConfig = SEED_CONFIG.presets[preset];
  if (!presetConfig) {
    throw new Error(`Unknown preset: ${preset}`);
  }

  const enabled = presetConfig.enabled;
  const ordered: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (collection: string) => {
    if (visited.has(collection)) return;
    if (visiting.has(collection)) {
      throw new Error(`Circular dependency detected involving: ${collection}`);
    }

    visiting.add(collection);

    const config = Object.hasOwn(SEED_CONFIG.collections, collection) ? SEED_CONFIG.collections[collection] : undefined;
    if (config?.dependencies) {
      for (const dep of config.dependencies) {
        if (enabled.includes(dep)) {
          visit(dep);
        }
      }
    }

    visiting.delete(collection);
    visited.add(collection);
    ordered.push(collection);
  };

  // Visit all enabled collections
  for (const collection of enabled) {
    visit(collection);
  }

  return ordered;
};
