/**
 * @module This file defines the configuration for resolving relationships between collections
 * during the seeding process.
 *
 * It provides a centralized, declarative way to specify how relationships should be handled,
 * replacing the need for hardcoded logic. This system defines which fields in a source
 * collection relate to a target collection, how to find the related document, and whether
 * the relationship is required.
 *
 * It also includes a function to determine the correct seeding order of collections based
 * on these defined dependencies, ensuring data integrity.
 */

/**
 * Relationship Configuration System
 *
 * This file defines the configuration for resolving relationships between collections
 * during the seeding process. It replaces the hardcoded relationship mappings
 * with a flexible, maintainable configuration system.
 */

export interface RelationshipConfig {
  /** The field name in the source collection that contains the relationship value */
  field: string;
  /** The target collection to search for the related item */
  targetCollection: string;
  /** The field in the target collection to search by (e.g., 'name', 'slug') */
  searchField: string;
  /** Optional fallback field to search if primary search fails */
  fallbackSearch?: string;
  /** Whether this relationship is required (will throw error if not found) */
  required?: boolean;
  /** Transform function to apply to search value before lookup */
  transform?: (value: string) => string;
}

/**
 * Configuration for all collection relationships
 *
 * This replaces the massive hardcoded switch statement in the original code
 * with a clean, maintainable configuration structure.
 */
export const RELATIONSHIP_CONFIG: Record<string, RelationshipConfig[]> = {
  // Datasets depend on catalogs
  datasets: [
    {
      field: "catalog",
      targetCollection: "catalogs",
      searchField: "name",
      fallbackSearch: "slug",
      required: true,
      transform: (value: string) => {
        // Handle common catalog name variations
        const mappings: Record<string, string> = {
          "test-catalog": "Test Catalog",
          "environmental-data": "Environmental Data",
          "economic-indicators": "Economic Indicators",
          "cultural-events": "Cultural Events",
          "academic-research": "Academic Research",
          "academic-research-portal": "Academic Research Portal",
          "government-data": "Government Data",
        };
        return mappings[value] ?? value;
      },
    },
  ],

  // Events depend on datasets
  events: [
    {
      field: "dataset",
      targetCollection: "datasets",
      searchField: "name",
      fallbackSearch: "slug",
      required: true,
      transform: (value: string) => {
        // Handle common dataset name variations
        const mappings: Record<string, string> = {
          "air-quality": "Air Quality Measurements",
          "environmental-data-air-quality-measurements": "Air Quality Measurements",
          "environmental-data-water-quality-assessments": "Water Quality Assessments",
          "environmental-data-climate-station-data": "Climate Station Data",
          "economic-indicators-gdp-growth-rates": "GDP Growth Rates",
          "economic-indicators-employment-statistics": "Employment Statistics",
          "economic-indicators-consumer-price-index": "Consumer Price Index",
          "academic-research-portal-research-study-results": "Research Study Results",
          "academic-research-portal-survey-response-data": "Survey Response Data",
          "water-quality": "Water Quality Data",
          "gdp-growth": "GDP Growth Rates",
          "employment-stats": "Employment Statistics",
          "cultural-participation": "Cultural Participation Rates",
          "research-publications": "Research Publications Database",
        };
        return mappings[value] ?? value;
      },
    },
  ],

  // Import catalogs reference catalogs
  "import-files": [
    {
      field: "catalog",
      targetCollection: "catalogs",
      searchField: "name",
      fallbackSearch: "slug",
      required: true, // Imports must be associated with a catalog
      transform: (value: string) => {
        // Handle common catalog name variations for imports
        const mappings: Record<string, string> = {
          "environmental-data": "Environmental Data",
          "economic-indicators": "Economic Indicators",
          "academic-research-portal": "Academic Research Portal",
          "cultural-events": "Cultural Events",
          "government-data": "Government Data",
        };
        return mappings[value] ?? value;
      },
    },
    {
      field: "datasets",
      targetCollection: "datasets",
      searchField: "name",
      fallbackSearch: "slug",
      required: false, // Imports can exist without being associated to a dataset
    },
  ],

  // Import jobs reference import files and datasets
  "import-jobs": [
    {
      field: "importFile",
      targetCollection: "import-files",
      searchField: "filename",
      fallbackSearch: "originalName",
      required: true, // Jobs must be associated with an import file
    },
    {
      field: "dataset",
      targetCollection: "datasets",
      searchField: "name",
      fallbackSearch: "slug",
      required: false, // Jobs can exist without being associated to a dataset initially
    },
  ],
};

/**
 * Get relationship configuration for a collection
 */
export const getRelationshipConfig = (collection: string): RelationshipConfig[] =>
  RELATIONSHIP_CONFIG[collection] ?? [];

/**
 * Validate relationship configuration
 * Ensures all required fields are present and configuration is valid
 */
export const validateRelationshipConfig = (): void => {
  const errors: string[] = [];

  Object.entries(RELATIONSHIP_CONFIG).forEach(([collection, configs]) => {
    configs.forEach((config, index) => {
      if (!config.field) {
        errors.push(`Missing 'field' in ${collection}[${index}]`);
      }
      if (!config.targetCollection) {
        errors.push(`Missing 'targetCollection' in ${collection}[${index}]`);
      }
      if (!config.searchField) {
        errors.push(`Missing 'searchField' in ${collection}[${index}]`);
      }
    });
  });

  if (errors.length > 0) {
    throw new Error(`Invalid relationship configuration:\n${errors.join("\n")}`);
  }
};

/**
 * Get all collections that have relationship dependencies
 */
export const getCollectionsWithRelationships = (): string[] => Object.keys(RELATIONSHIP_CONFIG);

/**
 * Get dependency order for collections
 * Returns collections in the order they should be seeded (dependencies first)
 */
export const getDependencyOrder = (collections: string[]): string[] => {
  const dependencies = new Map<string, string[]>();
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: string[] = [];

  // Build dependency map
  Object.entries(RELATIONSHIP_CONFIG).forEach(([collection, configs]) => {
    const deps = configs.filter((config) => config.required === true).map((config) => config.targetCollection);
    dependencies.set(collection, deps);
  });

  // Add collections without relationships
  collections.forEach((collection) => {
    if (dependencies.has(collection) === false) {
      dependencies.set(collection, []);
    }
  });

  // Topological sort
  const visit = (collection: string) => {
    if (visited.has(collection)) return;
    if (visiting.has(collection)) {
      throw new Error(`Circular dependency detected involving: ${collection}`);
    }

    visiting.add(collection);

    const deps = dependencies.get(collection) ?? [];
    deps.forEach((dep) => {
      if (collections.includes(dep)) {
        visit(dep);
      }
    });

    visiting.delete(collection);
    visited.add(collection);
    if (collections.includes(collection)) {
      result.push(collection);
    }
  };

  collections.forEach((collection) => visit(collection));
  return result;
};
