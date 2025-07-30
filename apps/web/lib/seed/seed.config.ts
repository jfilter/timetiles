/**
 * @module This file defines the centralized configuration for the database seeding system.
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
 */

/**
 * Configuration-Driven Seeding System
 *
 * This configuration file centralizes all seeding behavior, making it easy to:
 * - Control collection counts per environment
 * - Define dependencies between collections
 * - Enable/disable collections per environment
 * - Override behavior with environment-specific settings
 * - Configure custom data generators
 */

import type { RelationshipConfig } from "./relationship-config";
import { RELATIONSHIP_CONFIG } from "./relationship-config";

// Constants for collection names
const GEOCODING_PROVIDERS_COLLECTION = "geocoding-providers";

const getLocationCacheCount = (env: string): number => {
  if (env === "development") return 50;
  if (env === "test") return 10;
  return 0;
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

export interface EnvironmentConfig {
  /** Collections enabled for this environment */
  enabled: string[];
  /** Environment-specific overrides for collection configurations */
  overrides?: Record<string, Partial<CollectionConfig>>;
  /** Global environment settings */
  settings?: {
    useRealisticData?: boolean;
    performanceMode?: boolean;
    debugLogging?: boolean;
  };
}

export interface SeedConfiguration {
  /** Configuration for each collection */
  collections: Record<string, CollectionConfig>;
  /** Relationship configurations (imported from existing system) */
  relationships: Record<string, RelationshipConfig[]>;
  /** Environment-specific configurations */
  environments: Record<string, EnvironmentConfig>;
  /** Custom data generators */
  generators: Record<string, GeneratorConfig>;
}

export const SEED_CONFIG: SeedConfiguration = {
  collections: {
    // Users - foundational data
    users: {
      count: (env) => {
        switch (env) {
          case "development":
            return 15;
          case "test":
            return 5;
          case "production":
            return 3;
          default:
            return 1;
        }
      },
      dependencies: [],
      options: {
        includeTestUsers: true,
        createAdminUser: true,
      },
    },

    // Catalogs - organizational structure
    catalogs: {
      count: (env) => {
        switch (env) {
          case "development":
            return 6; // All catalog types
          case "test":
            return 3; // Base catalogs only
          case "production":
            return 2; // Minimal set
          default:
            return 2;
        }
      },
      dependencies: [],
      options: {
        includeArchivedCatalogs: false,
      },
    },

    // Datasets - depend on catalogs
    datasets: {
      count: (env) => {
        switch (env) {
          case "development":
            return 18; // 3 per catalog
          case "test":
            return 9; // 3 per base catalog
          case "production":
            return 4; // 2 per catalog
          default:
            return 2;
        }
      },
      dependencies: ["catalogs"],
      customGenerator: "realistic-dataset-distribution",
      options: {
        includeArchivedDatasets: false,
        generateSchemas: true,
      },
    },

    // Events - depend on datasets, high volume
    events: {
      count: (env) => {
        switch (env) {
          case "development":
            return 500; // Rich dataset for development
          case "test":
            return 50; // Sufficient for testing
          case "production":
            return 0; // No seed events in production
          default:
            return 10;
        }
      },
      dependencies: ["catalogs", "datasets"],
      customGenerator: "realistic-temporal-spatial-patterns",
      options: {
        useGeographicClustering: true,
        temporalDistribution: "realistic",
        includeGeocoding: true,
      },
    },

    // Import Files - depend on catalogs, operational data
    "import-files": {
      count: (env) => {
        switch (env) {
          case "development":
            return 12; // 2 per catalog
          case "test":
            return 6; // 2 per base catalog
          case "production":
            return 0; // No seed import files
          default:
            return 2;
        }
      },
      dependencies: ["catalogs"],
      options: {
        generateSampleFiles: true,
        includeFailedImports: true,
      },
    },

    // Import Jobs - depend on import files and datasets
    "import-jobs": {
      count: (env) => {
        switch (env) {
          case "development":
            return 12; // 1 per import file
          case "test":
            return 6; // 1 per import file
          case "production":
            return 0; // No seed import jobs
          default:
            return 2;
        }
      },
      dependencies: ["import-files", "datasets"],
      options: {
        generateProgressData: true,
      },
    },

    // Media - support files
    media: {
      count: (env) => (env === "development" ? 10 : 0),
      dependencies: [],
      disabled: true, // Disable for now, complex file handling
    },

    // Location cache - geocoding support
    "location-cache": {
      count: (env) => getLocationCacheCount(env),
      dependencies: [],
      options: {
        includeCommonLocations: true,
      },
    },

    // Geocoding providers - service configuration
    [GEOCODING_PROVIDERS_COLLECTION]: {
      count: (env) => (env === "development" ? 3 : 1),
      dependencies: [],
      options: {
        includeTestProviders: true,
      },
    },
  },

  // Import existing relationship configurations
  relationships: RELATIONSHIP_CONFIG,

  environments: {
    development: {
      enabled: [
        "users",
        "catalogs",
        "datasets",
        "events",
        "import-files",
        "import-jobs",
        "location-cache",
        GEOCODING_PROVIDERS_COLLECTION,
      ],
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
        datasets: {
          options: {
            includeArchivedDatasets: true,
            generateExtendedSchemas: true,
          },
        },
      },
      settings: {
        useRealisticData: true,
        performanceMode: false,
        debugLogging: true,
      },
    },

    test: {
      enabled: [
        "users",
        "catalogs",
        "datasets",
        "events",
        "import-files",
        "import-jobs",
        "location-cache",
        GEOCODING_PROVIDERS_COLLECTION,
      ],
      overrides: {
        events: {
          customGenerator: "simple-patterns",
          options: {
            useGeographicClustering: false,
            temporalDistribution: "uniform",
            includeGeocoding: false,
          },
        },
        datasets: {
          options: {
            generateSchemas: false, // Faster test execution
          },
        },
      },
      settings: {
        useRealisticData: false,
        performanceMode: true,
        debugLogging: false,
      },
    },

    production: {
      enabled: [
        "users", // Admin users only
        GEOCODING_PROVIDERS_COLLECTION, // Service configuration
      ],
      overrides: {
        users: {
          count: 1, // Single admin user
          options: {
            includeTestUsers: false,
            createAdminUser: true,
          },
        },
      },
      settings: {
        useRealisticData: false,
        performanceMode: true,
        debugLogging: false,
      },
    },

    staging: {
      enabled: ["users", "catalogs", "datasets", "events", GEOCODING_PROVIDERS_COLLECTION],
      overrides: {
        events: {
          count: 100, // Smaller dataset for staging
        },
      },
      settings: {
        useRealisticData: true,
        performanceMode: false,
        debugLogging: false,
      },
    },
  },

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

    "realistic-dataset-distribution": {
      type: "realistic",
      options: {
        // Ensure datasets are evenly distributed across catalogs
        evenDistribution: true,
        includeVariability: true, // Some catalogs have more datasets
        schemaComplexity: "varied", // Mix of simple and complex schemas
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
};

/**
 * Get configuration for a specific collection and environment
 */
export const getCollectionConfig = (collection: string, environment: string): CollectionConfig | null => {
  const baseConfig = Object.hasOwn(SEED_CONFIG.collections, collection)
    ? SEED_CONFIG.collections[collection]
    : undefined;
  if (baseConfig == null || baseConfig == undefined) return null;

  const envConfig = Object.hasOwn(SEED_CONFIG.environments, environment)
    ? SEED_CONFIG.environments[environment]
    : undefined;
  if (envConfig?.enabled.includes(collection) !== true) {
    // For disabled collections, still return the config but mark it as not enabled for this env
    // This allows tests to inspect the collection configuration even if it's disabled
    if (baseConfig.disabled === true) {
      return baseConfig; // Return the disabled collection config
    }
    return null; // Collection not enabled for this environment
  }

  // Apply environment-specific overrides
  const overrides = envConfig.overrides?.[collection] ?? {};

  return {
    ...baseConfig,
    ...overrides,
    options: {
      ...baseConfig.options,
      ...overrides.options,
    },
  };
};

/**
 * Get all enabled collections for an environment in dependency order
 */
export const getEnabledCollections = (environment: string): string[] => {
  const envConfig = Object.hasOwn(SEED_CONFIG.environments, environment)
    ? SEED_CONFIG.environments[environment]
    : undefined;
  if (!envConfig) {
    throw new Error(`Unknown environment: ${environment}`);
  }

  const enabled = envConfig.enabled;
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

/**
 * Get environment settings
 */
export const getEnvironmentSettings = (environment: string): EnvironmentConfig["settings"] =>
  SEED_CONFIG.environments[environment]?.settings ?? {};

/**
 * Get generator configuration
 */
export const getGeneratorConfig = (generatorName: string): GeneratorConfig | null =>
  SEED_CONFIG.generators[generatorName] ?? null;
