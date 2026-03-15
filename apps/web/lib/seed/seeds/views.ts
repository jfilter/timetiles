/**
 * Seed data for the Views collection.
 *
 * Creates a default view for the default site that shows all data
 * with auto-detected filters and default map settings.
 *
 * @module
 */
import type { View } from "@/payload-types";

export type ViewSeed = Omit<View, "id" | "createdAt" | "updatedAt">;

export const viewSeeds: ViewSeed[] = [
  {
    name: "Default",
    slug: "default-default",
    site: "default" as unknown as number, // Resolved by relationship resolver via site slug
    isDefault: true,
    isPublic: true,
    _status: "published",
    dataScope: { mode: "all" },
    filterConfig: { mode: "auto", maxFilters: 5 },
    mapSettings: { baseMapStyle: "default" },
  },
];
