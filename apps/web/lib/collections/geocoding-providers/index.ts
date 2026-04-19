/**
 * Defines the Payload CMS collection configuration for Geocoding Providers.
 *
 * This collection allows administrators to configure and manage multiple external geocoding services
 * (like Google Maps, Nominatim, etc.). It provides a centralized place to store API keys, rate limits,
 * priority, and other provider-specific settings. The system can then use these configurations
 * to dynamically select and use geocoding providers based on priority and availability.
 * It also tracks basic usage statistics for each provider.
 *
 * @module
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig } from "../shared-fields";
import { geocodingProviderFields } from "./fields";

export const GeocodingProviders: CollectionConfig = {
  slug: "geocoding-providers",
  ...createCommonConfig(),

  labels: { singular: "Geocoding Provider", plural: "Geocoding Providers" },
  admin: {
    group: "System",
    description: "Manage geocoding provider configurations",
    defaultColumns: ["name", "type", "enabled", "priority", "tags"],
    listSearchableFields: ["name", "type", "tags.value"],
    useAsTitle: "name",
    components: { beforeList: ["/components/admin/geocoding-test-panel"] },
  },
  access: {
    read: ({ req: { user } }) => user?.role === "admin",
    create: ({ req: { user } }) => user?.role === "admin",
    update: ({ req: { user } }) => user?.role === "admin",
    delete: ({ req: { user } }) => user?.role === "admin",
    readVersions: ({ req: { user } }) => user?.role === "admin",
  },
  fields: geocodingProviderFields,
};

export default GeocodingProviders;
