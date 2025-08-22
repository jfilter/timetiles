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
import type { Config } from "@/payload-types";

import type { CollectionConfig } from "./seed.config";
import type { CatalogSeed } from "./seeds/catalogs";
import type { DatasetSeed } from "./seeds/datasets";
import type { EventSeed } from "./seeds/events";
// ImportSeed removed - import jobs are created dynamically, not seeded
import type { UserSeed } from "./seeds/users";

export type SeedData =
  | UserSeed[]
  | CatalogSeed[]
  | DatasetSeed[]
  | EventSeed[]
  | Config["globals"]["main-menu"][]
  | unknown[];

export interface SeedOptions {
  collections?: string[];
  truncate?: boolean;
  environment?: "development" | "test" | "production" | "staging";
  /** Override configuration for specific collections */
  configOverrides?: Record<string, Partial<CollectionConfig>>;
  /** Use configuration-driven seeding */
  useConfig?: boolean;
}
