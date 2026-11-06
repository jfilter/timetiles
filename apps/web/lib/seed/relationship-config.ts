/**
 * Declarative relationship configuration for the seeding process.
 *
 * Defines which fields in a source collection relate to a target collection,
 * which field identifies the related document, and whether the relationship is
 * required. Seeding order is derived from collection dependencies in `seed.config.ts`.
 *
 * @module
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

/** Relationship configuration per seeded collection. */
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

  // Events resolve datasets by SLUG: dataset names come from shared templates and repeat
  // across catalogs, so a name lookup would attach events to another catalog's dataset.
  // `name` remains only as a fallback for seeds that reference a dataset by title.
  events: [
    { field: "dataset", targetCollection: "datasets", searchField: "slug", fallbackSearch: "name", required: true },
  ],

  // Ingest files depend on users
  "ingest-files": [{ field: "user", targetCollection: "users", searchField: "email", required: true }],

  // Ingest jobs depend on ingest files and datasets
  "ingest-jobs": [
    { field: "ingestFile", targetCollection: "ingest-files", searchField: "originalName", required: true },
    { field: "dataset", targetCollection: "datasets", searchField: "slug", required: true },
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
