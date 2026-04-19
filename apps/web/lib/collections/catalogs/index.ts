/**
 * Defines the Payload CMS collection configuration for Catalogs.
 *
 * A Catalog is a high-level container for organizing related datasets.
 * It provides a way to group data from different sources under a common theme or project.
 * This collection stores basic metadata for each catalog, such as its name, description, and public visibility.
 *
 * ⚠️ Payload CMS Deadlock Prevention
 * This file uses complex hooks with nested Payload operations.
 * See: apps/docs/content/developer-guide/development/payload-deadlocks.mdx
 *
 * @category Collections
 * @module
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig } from "../shared-fields";
import { catalogsAccess } from "./access";
import { catalogFields } from "./fields";
import { catalogAfterChangeHooks, catalogAfterDeleteHook, catalogBeforeChangeHooks } from "./hooks";

const Catalogs: CollectionConfig = {
  slug: "catalogs",
  ...createCommonConfig(),
  admin: { useAsTitle: "name", defaultColumns: ["name", "isPublic", "createdBy"], group: "Data" },
  access: catalogsAccess,
  fields: catalogFields,
  hooks: {
    beforeChange: catalogBeforeChangeHooks,
    afterChange: catalogAfterChangeHooks,
    afterDelete: [catalogAfterDeleteHook],
  },
};

export default Catalogs;
