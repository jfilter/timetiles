/**
 * Seed data for the Views collection.
 *
 * Creates a default view for the default site that shows all data
 * with auto-detected filters and default map settings.
 *
 * @module
 */
import type { View } from "@/payload-types";

/** Seed data type for Views. Allows string slugs for relationship fields (resolved at seed time). */
export type ViewSeed = Omit<View, "id" | "createdAt" | "updatedAt" | "site"> & { site: number | string };

export const viewSeeds: ViewSeed[] = [
  {
    name: "Default",
    slug: "default-default",
    site: "default", // Resolved by relationship resolver via site slug
    isDefault: true,
    isPublic: true,
    _status: "published",
    dataScope: { mode: "all" },
    filterConfig: { mode: "auto", maxFilters: 5 },
    mapSettings: { baseMapStyle: "default" },
  },
];
