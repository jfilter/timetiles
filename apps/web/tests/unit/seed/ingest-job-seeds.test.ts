/**
 * Unit tests for the ingest job seed data.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { RELATIONSHIP_CONFIG } from "@/lib/seed/relationship-config";
import { datasetSeeds } from "@/lib/seed/seeds/datasets";
import { ingestJobSeeds } from "@/lib/seed/seeds/ingest-jobs";

describe("ingest job seeds", () => {
  it("reference each dataset by a field that matches exactly one seeded dataset", () => {
    const datasetConfig = RELATIONSHIP_CONFIG["ingest-jobs"]?.find((config) => config.field === "dataset");
    const searchField = datasetConfig?.searchField as "slug" | "name";
    const datasets = datasetSeeds("development");

    for (const job of ingestJobSeeds("development")) {
      const matches = datasets.filter((dataset) => dataset[searchField] === job.dataset);
      expect(matches, `dataset reference "${job.dataset}"`).toHaveLength(1);
    }
  });
});
