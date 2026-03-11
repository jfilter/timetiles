/**
 * Seed data for the Sites collection.
 *
 * Creates a default site that serves as the fallback when no domain matches.
 *
 * @module
 */
import type { Site } from "@/payload-types";

export type SiteSeed = Omit<Site, "id" | "createdAt" | "updatedAt">;

export const siteSeeds: SiteSeed[] = [
  {
    name: "TimeTiles",
    slug: "default",
    isDefault: true,
    isPublic: true,
    _status: "published",
    branding: { title: "TimeTiles" },
  },
];
