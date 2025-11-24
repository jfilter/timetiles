/**
 * This file defines the core TypeScript types and interfaces used throughout the seeding system.
 *
 * It provides a centralized location for the data structures that represent seed data for
 * different collections and the options for configuring the seeding process. This ensures
 * type safety and consistency when passing data and options between different modules
 * of the seeding system.
 *
 * @module
 */
import type { CollectionConfig } from "./seed.config";
import type { CatalogSeed } from "./seeds/catalogs";
import type { DatasetSeed } from "./seeds/datasets";
import type { EventSeed } from "./seeds/events";
import type { FooterSeed } from "./seeds/footer";
import type { MainMenuSeed } from "./seeds/main-menu";
import type { PageSeed } from "./seeds/pages";
// ImportSeed removed - import jobs are created dynamically, not seeded
import type { UserSeed } from "./seeds/users";

export type SeedData =
  | UserSeed[]
  | CatalogSeed[]
  | DatasetSeed[]
  | EventSeed[]
  | PageSeed[]
  | MainMenuSeed[]
  | FooterSeed[];

export interface SeedOptions {
  collections?: string[];
  truncate?: boolean;
  /** Seeding preset name */
  preset?: string;
  /** How much data to generate */
  volume?: "minimal" | "small" | "medium" | "large" | "xlarge";
  /** How realistic/complex the data should be */
  realism?: "simple" | "realistic" | "production-like";
  /** Performance vs richness trade-off */
  performance?: "fast" | "balanced" | "rich";
  /** Logging verbosity */
  debugging?: "quiet" | "normal" | "verbose";
  /** Seed for deterministic random generation */
  randomSeed?: number;
  /** Override counts for specific collections */
  countOverrides?: Record<string, number>;
  /** Override configuration for specific collections */
  configOverrides?: Record<string, Partial<CollectionConfig>>;
  /** Exit process on seeding failure (default: true, set false in tests) */
  exitOnFailure?: boolean;
}
