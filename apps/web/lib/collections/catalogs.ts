/**
 * Defines the Payload CMS collection configuration for Catalogs.
 *
 * A Catalog is a high-level container for organizing related datasets.
 * It provides a way to group data from different sources under a common theme or project.
 * This collection stores basic metadata for each catalog, such as its name, description, and public visibility.
 *
 * @category Collections
 * @module
 */
import type { CollectionConfig } from "payload";

import { basicMetadataFields, createCommonConfig, createSlugField } from "./shared-fields";

const Catalogs: CollectionConfig = {
  slug: "catalogs",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "isPublic"],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
    readVersions: () => true,
  },
  fields: [
    ...basicMetadataFields,
    createSlugField("catalogs"),
    {
      name: "isPublic",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
      },
    },
  ],
};

export default Catalogs;
