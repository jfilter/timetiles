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
    defaultColumns: ["name", "isPublic", "createdBy"],
  },
  access: {
    // Public catalogs can be read by anyone, private ones only by creator or admins
    // @ts-expect-error - Payload access control allows returning true | Where query object
    // eslint-disable-next-line sonarjs/function-return-type
    read: ({ req: { user } }) => {
      // Admins can read all
      if (user?.role === "admin") return true;

      // Users (including not logged in) can read public catalogs OR their own private catalogs
      if (user) {
        return {
          or: [{ isPublic: { equals: true } }, { createdBy: { equals: user.id } }],
        };
      }

      // Not logged in - only public catalogs
      return {
        isPublic: { equals: true },
      };
    },

    // Only authenticated users can create catalogs
    create: ({ req: { user } }) => Boolean(user),

    // Only creator or admins can update
    update: ({ req: { user }, data }) => {
      if (user?.role === "admin") return true;

      if (user && data?.createdBy) {
        const createdById = typeof data.createdBy === "object" ? data.createdBy.id : data.createdBy;
        return user.id === createdById;
      }

      return false;
    },

    // Only creator or admins can delete
    delete: ({ req: { user }, data }) => {
      if (user?.role === "admin") return true;

      if (user && data?.createdBy) {
        const createdById = typeof data.createdBy === "object" ? data.createdBy.id : data.createdBy;
        return user.id === createdById;
      }

      return false;
    },

    // Only admins can read version history
    readVersions: ({ req: { user } }) => user?.role === "admin",
  },
  fields: [
    ...basicMetadataFields,
    createSlugField("catalogs"),
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "User who created this catalog",
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
  ],
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        // Auto-set createdBy on creation
        if (operation === "create" && req.user) {
          data.createdBy = req.user.id;
        }
        return data;
      },
    ],
  },
};

export default Catalogs;
