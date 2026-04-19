/**
 * Field definitions for catalogs collection.
 *
 * @module
 */
import type { Field } from "payload";

import { basicMetadataFields, createCreatedByField, createIsPublicField, createSlugField } from "../shared-fields";

export const catalogFields: Field[] = [
  ...basicMetadataFields,
  createSlugField("catalogs"),
  createCreatedByField("User who created this catalog"),
  createIsPublicField({ showPrivateNotice: true }),
  {
    name: "license",
    type: "text",
    maxLength: 255,
    admin: { description: "License identifier (e.g., CC-BY-4.0, CC-BY-IGO, dl-de/by-2-0)" },
  },
  {
    name: "sourceUrl",
    type: "text",
    maxLength: 2048,
    admin: { description: "URL to original data source for attribution" },
  },
  {
    name: "category",
    type: "text",
    maxLength: 100,
    admin: { description: 'Category (e.g., "conflict", "civic-data", "infrastructure")' },
  },
  {
    name: "region",
    type: "text",
    maxLength: 255,
    admin: { description: 'Geographic region (e.g., "Myanmar", "Berlin, Germany")' },
  },
  {
    name: "tags",
    type: "array",
    admin: { description: "Tags for discoverability" },
    fields: [{ name: "tag", type: "text", required: true, maxLength: 100 }],
  },
  {
    name: "publisher",
    type: "group",
    admin: { description: "Original data publisher for attribution" },
    fields: [
      { name: "name", type: "text", maxLength: 255, admin: { description: "Publisher name" } },
      { name: "url", type: "text", maxLength: 2048, admin: { description: "Publisher website URL" } },
      { name: "acronym", type: "text", maxLength: 50, admin: { description: "Short name (e.g., ACLED, UCDP)" } },
      { name: "description", type: "textarea", admin: { description: "Publisher description (markdown)" } },
      {
        name: "country",
        type: "text",
        maxLength: 2,
        admin: { description: "ISO 3166-1 alpha-2 country code (e.g., us, de)" },
      },
      { name: "official", type: "checkbox", defaultValue: false, admin: { description: "Government or IGO source" } },
    ],
  },
  {
    name: "coverage",
    type: "group",
    admin: { description: "Geographic and temporal coverage (FtM-compatible)" },
    fields: [
      {
        name: "countries",
        type: "array",
        admin: { description: "ISO 3166-1 alpha-2 country codes covered by this catalog" },
        fields: [{ name: "code", type: "text", required: true, maxLength: 2 }],
      },
      { name: "start", type: "text", maxLength: 10, admin: { description: "Dataset start date (YYYY-MM-DD or YYYY)" } },
    ],
  },
];
