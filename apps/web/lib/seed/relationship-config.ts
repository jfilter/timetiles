/**
 * This file defines the configuration for resolving relationships between collections
 * during the seeding process.
 *
 * It provides a centralized, declarative way to specify how relationships should be handled,
 * replacing the need for hardcoded logic. This system defines which fields in a source
 * collection relate to a target collection, how to find the related document, and whether
 * the relationship is required.
 *
 * It also includes a function to determine the correct seeding order of collections based
 * on these defined dependencies, ensuring data integrity.
 *
 * @module
 */

/**
 * Relationship Configuration System.
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
 * Configuration for all collection relationships.
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

  // Pages depend on sites
  pages: [{ field: "site", targetCollection: "sites", searchField: "slug", required: true }],

  // Views depend on sites
  views: [{ field: "site", targetCollection: "sites", searchField: "slug", required: true }],

  // Scheduled ingests depend on users and catalogs
  "scheduled-ingests": [
    { field: "createdBy", targetCollection: "users", searchField: "email", required: true },
    { field: "catalog", targetCollection: "catalogs", searchField: "name", fallbackSearch: "slug", required: true },
  ],

  // Events depend on datasets.
  //
  // Resolved by SLUG, which is the only identifier that is actually unique.
  // Dataset slugs are `${catalog.slug}-${template.slug}` (seeds/datasets.ts),
  // while `name` comes straight from the shared template — so every catalog of
  // the same type produces datasets with IDENTICAL names ("Research Study
  // Results" exists under academic-research-portal, historical-records AND
  // health-medical-data). Searching by name with limit:1 therefore resolved all
  // of them to whichever was created last, and events seeded for one catalog
  // silently landed in another catalog's dataset.
  //
  // Event seeds already carry the full slug (`dataset: config.slug` in
  // seeds/events.ts), so the slug→name transform table this used to apply was
  // converting a unique key into an ambiguous one. It is gone; `name` remains
  // only as a fallback for any seed that still references a dataset by title.
  events: [
    { field: "dataset", targetCollection: "datasets", searchField: "slug", fallbackSearch: "name", required: true },
  ],

  // Ingest files depend on users
  "ingest-files": [{ field: "user", targetCollection: "users", searchField: "email", required: true }],

  // Ingest jobs depend on ingest files and datasets
  "ingest-jobs": [
    { field: "ingestFile", targetCollection: "ingest-files", searchField: "originalName", required: true },
    { field: "dataset", targetCollection: "datasets", searchField: "name", fallbackSearch: "slug", required: true },
  ],

  // Scraper repos depend on users and catalogs
  "scraper-repos": [
    { field: "createdBy", targetCollection: "users", searchField: "email", required: true },
    { field: "catalog", targetCollection: "catalogs", searchField: "name", fallbackSearch: "slug", required: true },
  ],

  // Scrapers depend on scraper repos
  scrapers: [{ field: "repo", targetCollection: "scraper-repos", searchField: "name", required: true }],

  // Scraper runs depend on scrapers
  "scraper-runs": [{ field: "scraper", targetCollection: "scrapers", searchField: "name", required: true }],
};

/**
 * Get relationship configuration for a collection.
 */
export const getRelationshipConfig = (collection: string): RelationshipConfig[] =>
  RELATIONSHIP_CONFIG[collection] ?? [];

/**
 * Validate relationship configuration
 * Ensures all required fields are present and configuration is valid.
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
