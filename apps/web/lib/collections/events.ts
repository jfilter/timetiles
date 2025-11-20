/**
 * Defines the Payload CMS collection configuration for Events.
 *
 * The Events collection is the core data storage for all time-based and location-based information.
 * Each document in this collection represents a single event or data point. It is designed to be flexible,
 * storing the original, unprocessed data in a JSON field while also providing structured fields for
 * critical information like location, timestamps, and validation status.
 *
 * Key features of this collection include:
 * - Storing raw data and structured, processed data separately.
 * - Detailed tracking of location data, including its source and confidence.
 * - Information about the geocoding process.
 * - Unique identifiers for deduplication and linking to source data.
 * - Relationships to the parent dataset, import job, and schema version.
 *
 * ⚠️ Payload CMS Deadlock Prevention
 * This file uses complex hooks with nested Payload operations.
 * See: apps/docs/content/developer-guide/development/payload-deadlocks.mdx
 *
 * @module
 */
import type { CollectionConfig, Where } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import { QUOTA_TYPES, USAGE_TYPES } from "@/lib/constants/quota-constants";
import { getQuotaService } from "@/lib/services/quota-service";

import { createCommonConfig } from "./shared-fields";

const Events: CollectionConfig = {
  slug: "events",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "id",
    defaultColumns: ["dataset", "eventTimestamp", "createdAt", "validationStatus", "geocodingStatus"],
    pagination: {
      defaultLimit: 50,
    },
    preview: (doc) => {
      // Generate preview URL (uses JWT authentication via HTTP-only cookies)
      const params = new URLSearchParams({
        collection: COLLECTION_NAMES.EVENTS,
        slug: String(doc.id),
      });

      return `/api/preview?${params.toString()}`;
    },
  },
  access: {
    // Events inherit access from their dataset and catalog
    read: async ({ req }) => {
      const { user, payload } = req;
      if (user?.role === "admin") return true;

      // Get accessible catalogs using shared helper
      const { publicCatalogIds, ownedCatalogIds } = await (
        await import("@/lib/services/access-control")
      ).getAccessibleCatalogIds(payload, user);

      // Get accessible datasets:
      // - Public datasets in public catalogs
      // - Any dataset in owned catalogs
      const datasetConditions: Array<string | number> = [];

      if (publicCatalogIds.length > 0) {
        const publicDatasets = await payload.find({
          collection: "datasets",
          where: {
            and: [{ catalog: { in: publicCatalogIds } }, { isPublic: { equals: true } }],
          },
          limit: 500,
          pagination: false,
          overrideAccess: true,
        });
        datasetConditions.push(...publicDatasets.docs.map((ds) => ds.id));
      }

      if (ownedCatalogIds.length > 0) {
        const ownedDatasets = await payload.find({
          collection: "datasets",
          where: {
            catalog: { in: ownedCatalogIds },
          },
          limit: 500,
          pagination: false,
          overrideAccess: true,
        });
        datasetConditions.push(...ownedDatasets.docs.map((ds) => ds.id));
      }

      if (datasetConditions.length === 0) {
        // Return impossible condition instead of false to allow 200 with empty results
        // This provides graceful degradation when there's no public data
        return { dataset: { equals: -1 } } as Where; // No event has dataset ID -1
      }

      // Return events in accessible datasets
      return {
        dataset: { in: datasetConditions },
      };
    },

    // Only authenticated users can create events in datasets they have access to
    create: async ({ req: { user, payload }, data }) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      if (!data?.dataset) return false;

      const datasetId = typeof data.dataset === "object" ? data.dataset.id : data.dataset;

      try {
        const dataset = await payload.findByID({ collection: "datasets", id: datasetId, overrideAccess: true });
        if (!dataset) return false;

        const catalogId = typeof dataset.catalog === "object" ? dataset.catalog.id : dataset.catalog;
        const catalog = await payload.findByID({ collection: "catalogs", id: catalogId, overrideAccess: true });

        // Can create events if dataset and catalog are both public
        if (dataset.isPublic && catalog?.isPublic) return true;

        // Or if user owns the catalog
        if (!catalog?.createdBy) return false;
        const createdById = typeof catalog.createdBy === "object" ? catalog.createdBy.id : catalog.createdBy;
        return user.id === createdById;
      } catch {
        return false;
      }
    },

    // Only catalog owner or admins can update
    update: async ({ req, id }) => {
      const { user, payload } = req;
      if (user?.role === "admin") return true;

      if (!user || !id) return false;

      try {
        // Fetch the existing event with override to get dataset info
        const existingEvent = await payload.findByID({
          collection: "events",
          id,
          overrideAccess: true,
        });

        if (existingEvent?.dataset) {
          const datasetId =
            typeof existingEvent.dataset === "object" ? existingEvent.dataset.id : existingEvent.dataset;
          const dataset = await payload.findByID({
            collection: "datasets",
            id: datasetId,
            overrideAccess: true,
          });

          if (dataset?.catalog) {
            const catalogId = typeof dataset.catalog === "object" ? dataset.catalog.id : dataset.catalog;
            const catalog = await payload.findByID({
              collection: "catalogs",
              id: catalogId,
              overrideAccess: true,
            });

            if (catalog?.createdBy) {
              const createdById = typeof catalog.createdBy === "object" ? catalog.createdBy.id : catalog.createdBy;
              return user.id === createdById;
            }
          }
        }

        return false;
      } catch {
        return false;
      }
    },

    // Only catalog owner or admins can delete
    delete: async ({ req, id }) => {
      const { user, payload } = req;
      if (user?.role === "admin") return true;

      if (!user || !id) return false;

      try {
        // Fetch the existing event with override to get dataset info
        const existingEvent = await payload.findByID({
          collection: "events",
          id,
          overrideAccess: true,
        });

        if (existingEvent?.dataset) {
          const datasetId =
            typeof existingEvent.dataset === "object" ? existingEvent.dataset.id : existingEvent.dataset;
          const dataset = await payload.findByID({
            collection: "datasets",
            id: datasetId,
            overrideAccess: true,
          });

          if (dataset?.catalog) {
            const catalogId = typeof dataset.catalog === "object" ? dataset.catalog.id : dataset.catalog;
            const catalog = await payload.findByID({
              collection: "catalogs",
              id: catalogId,
              overrideAccess: true,
            });

            if (catalog?.createdBy) {
              const createdById = typeof catalog.createdBy === "object" ? catalog.createdBy.id : catalog.createdBy;
              return user.id === createdById;
            }
          }
        }

        return false;
      } catch {
        return false;
      }
    },

    // Only admins can read version history
    readVersions: ({ req: { user } }) => user?.role === "admin",
  },
  fields: [
    {
      name: "dataset",
      type: "relationship",
      relationTo: "datasets",
      required: true,
      hasMany: false,
    },
    {
      name: "importJob",
      type: "relationship",
      relationTo: "import-jobs",
      hasMany: false,
      admin: {
        description: "The import job that created this event",
      },
    },
    {
      name: "data",
      type: "json",
      required: true,
      admin: {
        description: "Generic data in JSON format",
      },
    },
    {
      name: "location",
      type: "group",
      fields: [
        {
          name: "latitude",
          type: "number",
          admin: {
            step: 0.000001,
          },
        },
        {
          name: "longitude",
          type: "number",
          admin: {
            step: 0.000001,
          },
        },
      ],
      admin: {
        description: "Geographic coordinates (WGS84)",
      },
    },
    {
      name: "coordinateSource",
      type: "group",
      fields: [
        {
          name: "type",
          type: "select",
          options: [
            { label: "Pre-existing in Import", value: "import" },
            { label: "Geocoded from Address", value: "geocoded" },
            { label: "Manual Entry", value: "manual" },
            { label: "Not Available", value: "none" },
          ],
          defaultValue: "none",
        },
        {
          name: "importColumns",
          type: "group",
          fields: [
            {
              name: "latitudeColumn",
              type: "text",
              admin: {
                description: "Column name containing latitude",
              },
            },
            {
              name: "longitudeColumn",
              type: "text",
              admin: {
                description: "Column name containing longitude",
              },
            },
            {
              name: "combinedColumn",
              type: "text",
              admin: {
                description: "Column name if coordinates were combined",
              },
            },
            {
              name: "format",
              type: "text",
              admin: {
                description: "Format of coordinates (decimal, DMS, etc.)",
              },
            },
          ],
          admin: {
            condition: (data) => (data.coordinateSource as { type?: string })?.type === "import",
          },
        },
        {
          name: "confidence",
          type: "number",
          min: 0,
          max: 1,
          admin: {
            step: 0.01,
            description: "Confidence in coordinate accuracy (0-1)",
          },
        },
        {
          name: "validationStatus",
          type: "select",
          options: [
            { label: "Valid", value: "valid" },
            { label: "Out of Range", value: "out_of_range" },
            { label: "Suspicious (0,0)", value: "suspicious_zero" },
            { label: "Swapped", value: "swapped" },
            { label: "Invalid Format", value: "invalid" },
          ],
        },
      ],
      admin: {
        description: "Source and validation of coordinate data",
      },
    },
    {
      name: "eventTimestamp",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "When the actual event occurred",
      },
    },

    {
      name: "validationErrors",
      type: "json",
      admin: {
        description: "Validation errors if any",
        condition: (data) => data?.validationStatus === "invalid" || data?.validationStatus === "transformed",
      },
    },
    {
      name: "geocodingInfo",
      type: "group",
      fields: [
        {
          name: "originalAddress",
          type: "text",
          admin: {
            description: "Original address string from import",
          },
        },
        {
          name: "geocodingStatus",
          type: "select",
          options: [
            { label: "Pending", value: "pending" },
            { label: "Success", value: "success" },
            { label: "Failed", value: "failed" },
          ],
          admin: {
            description: "Geocoding processing status",
          },
        },
        {
          name: "provider",
          type: "select",
          options: [
            {
              label: "Google Maps",
              value: "google",
            },
            {
              label: "Nominatim (OpenStreetMap)",
              value: "nominatim",
            },
            {
              label: "Manual Entry",
              value: "manual",
            },
          ],
          admin: {
            description: "Geocoding provider used",
          },
        },
        {
          name: "confidence",
          type: "number",
          min: 0,
          max: 1,
          admin: {
            step: 0.01,
            description: "Geocoding confidence score (0-1)",
          },
        },
        {
          name: "normalizedAddress",
          type: "text",
          admin: {
            description: "Normalized address returned by geocoder",
          },
        },
      ],
      admin: {
        description: "Geocoding metadata and information",
      },
    },
    {
      name: "uniqueId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "Unique identifier for deduplication (format: datasetId:strategy:value)",
      },
    },
    {
      name: "sourceId",
      type: "text",
      index: true,
      admin: {
        description: "Original ID from source system (when using external ID strategy)",
      },
    },
    {
      name: "contentHash",
      type: "text",
      index: true,
      admin: {
        description: "SHA256 hash of data content for duplicate detection",
      },
    },
    {
      name: "importBatch",
      type: "number",
      index: true,
      admin: {
        description: "Batch number within import for tracking",
      },
    },
    {
      name: "schemaVersionNumber",
      type: "number",
      admin: {
        description: "Schema version number this event was validated against",
      },
    },
    {
      name: "validationStatus",
      type: "select",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Valid", value: "valid" },
        { label: "Invalid", value: "invalid" },
        { label: "Transformed", value: "transformed" },
      ],
      defaultValue: "pending",
      index: true,
    },
    {
      name: "transformations",
      type: "json",
      admin: {
        condition: (data) => data?.validationStatus === "transformed",
        description: "Record of any type transformations applied",
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, req }) => {
        // Skip quota checks for system operations and admin users
        if (!req.user || req.user.role === "admin") {
          return data;
        }

        // Only check quotas on creation
        if (operation === "create") {
          const quotaService = getQuotaService(req.payload);

          // Check total events quota
          const totalEventsCheck = quotaService.checkQuota(req.user, QUOTA_TYPES.TOTAL_EVENTS, 1);

          if (!totalEventsCheck.allowed) {
            throw new Error(
              `Total events limit reached (${totalEventsCheck.current}/${totalEventsCheck.limit}). ` +
                `Please upgrade your account or remove old events.`
            );
          }
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        // Track event creation
        if (operation === "create" && req.user && req.user.role !== "admin") {
          const quotaService = getQuotaService(req.payload);

          // Increment total events counter
          await quotaService.incrementUsage(req.user.id, USAGE_TYPES.TOTAL_EVENTS_CREATED, 1, req);
        }

        return doc;
      },
    ],
  },
  indexes: [
    {
      fields: ["dataset", "eventTimestamp"],
    },
    {
      fields: ["eventTimestamp"],
    },
    {
      fields: ["uniqueId"],
    },
    {
      fields: ["dataset", "contentHash"],
    },
    {
      fields: ["importJob", "importBatch"],
    },
    {
      fields: ["validationStatus"],
    },
  ],
};

export default Events;
