import type { CollectionConfig } from "payload";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { createSlugHook } from "../utils/slug";

const Catalogs: CollectionConfig = {
  slug: "catalogs",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "status", "createdAt"],
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
        description:
          "URL-friendly identifier (auto-generated from name if not provided)",
      },
      hooks: {
        beforeValidate: [createSlugHook("catalogs")],
      },
    },
    {
      name: "status",
      type: "select",
      options: [
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
  ],
  timestamps: true,
};

export default Catalogs;
