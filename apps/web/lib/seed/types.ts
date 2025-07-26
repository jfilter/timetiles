import type { Config } from "@/payload-types";

import type { CollectionConfig } from "./seed.config";
import type { CatalogSeed } from "./seeds/catalogs";
import type { DatasetSeed } from "./seeds/datasets";
import type { EventSeed } from "./seeds/events";
import type { ImportSeed } from "./seeds/imports";
import type { UserSeed } from "./seeds/users";

export type SeedData =
  | UserSeed[]
  | CatalogSeed[]
  | DatasetSeed[]
  | EventSeed[]
  | ImportSeed[]
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
