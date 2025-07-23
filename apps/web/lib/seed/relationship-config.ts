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
          "government-data": "Government Data",
        };
        return mappings[value] || value;
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
          "water-quality": "Water Quality Data",
          "gdp-growth": "GDP Growth Rates",
          "employment-stats": "Employment Statistics",
          "cultural-participation": "Cultural Participation Rates",
          "research-publications": "Research Publications Database",
        };
        return mappings[value] || value;
      },
    },
  ],

  // Imports can reference catalogs and optionally datasets
  imports: [
    {
      field: "catalog",
      targetCollection: "catalogs",
      searchField: "slug",
      fallbackSearch: "name",
      required: true, // Imports must be associated with a catalog
    },
    {
      field: "dataset",
      targetCollection: "datasets",
      searchField: "name",
      fallbackSearch: "slug",
      required: false, // Imports can exist without being associated to a dataset
    },
  ],
};

/**
 * Get relationship configuration for a collection
 */
export function getRelationshipConfig(
  collection: string,
): RelationshipConfig[] {
  return RELATIONSHIP_CONFIG[collection] || [];
}

/**
 * Validate relationship configuration
 * Ensures all required fields are present and configuration is valid
 */
export function validateRelationshipConfig(): void {
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
    throw new Error(
      `Invalid relationship configuration:\n${errors.join("\n")}`,
    );
  }
}

/**
 * Get all collections that have relationship dependencies
 */
export function getCollectionsWithRelationships(): string[] {
  return Object.keys(RELATIONSHIP_CONFIG);
}

/**
 * Get dependency order for collections
 * Returns collections in the order they should be seeded (dependencies first)
 */
export function getDependencyOrder(collections: string[]): string[] {
  const dependencies = new Map<string, string[]>();
  const visited = new Set<string>();
  const result: string[] = [];

  // Build dependency map
  Object.entries(RELATIONSHIP_CONFIG).forEach(([collection, configs]) => {
    const deps = configs
      .filter((config) => config.required)
      .map((config) => config.targetCollection);
    dependencies.set(collection, deps);
  });

  // Add collections without relationships
  collections.forEach((collection) => {
    if (!dependencies.has(collection)) {
      dependencies.set(collection, []);
    }
  });

  // Topological sort
  function visit(collection: string) {
    if (visited.has(collection)) return;
    visited.add(collection);

    const deps = dependencies.get(collection) || [];
    deps.forEach((dep) => {
      if (collections.includes(dep)) {
        visit(dep);
      }
    });

    if (collections.includes(collection)) {
      result.push(collection);
    }
  }

  collections.forEach((collection) => visit(collection));
  return result;
}
