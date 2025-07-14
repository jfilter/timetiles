import type { CollectionConfig } from "payload";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { createSlugHook } from "../utils/slug";

const Datasets: CollectionConfig = {
  slug: "datasets",
  admin: {
    useAsTitle: "name",
    defaultColumns: [
      "name",
      "catalog",
      "language",
      "status",
      "isPublic",
      "createdAt",
    ],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      maxLength: 255,
    },
    {
      name: "description",
      type: "richText",
      editor: lexicalEditor({}),
    },
    {
      name: "slug",
      type: "text",
      maxLength: 255,
      unique: true,
      admin: {
        position: "sidebar",
      },
      hooks: {
        beforeValidate: [createSlugHook("datasets")],
      },
    },
    {
      name: "catalog",
      type: "relationship",
      relationTo: "catalogs",
      required: true,
      hasMany: false,
    },
    {
      name: "language",
      type: "text",
      required: true,
      maxLength: 3,
      admin: {
        description: "ISO-639 3 letter code (e.g., eng, deu, fra)",
      },
    },
    {
      name: "status",
      type: "select",
      options: [
        {
          label: "Draft",
          value: "draft",
        },
        {
          label: "Active",
          value: "active",
        },
        {
          label: "Archived",
          value: "archived",
        },
      ],
      defaultValue: "active",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "isPublic",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "schema",
      type: "json",
      required: true,
      admin: {
        description: "JSON schema definition for this dataset",
      },
    },
    {
      name: "metadata",
      type: "json",
      admin: {
        description: "Additional metadata for the dataset",
      },
    },
  ],
  timestamps: true,
};

export default Datasets;
