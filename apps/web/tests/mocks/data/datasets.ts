/**
 * @module
 */
import type { Dataset } from "@/payload-types";

import { createRichText } from "../utils/factories";

export const createMockDataset = (overrides: Partial<Dataset> = {}): Dataset => ({
  id: 1,
  name: "Test Dataset",
  description: createRichText("A test dataset description"),
  catalog: 1,
  slug: "test-dataset",
  language: "eng",
  _status: "published" as const,
  isPublic: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createMockDatasets = (count: number = 3): Dataset[] => {
  // Define dataset names that match test expectations
  const datasetNames = ["Air Quality Measurements", "Water Quality Data", "GDP Growth Rates"];

  return Array.from({ length: count }, (_, i) => {
    const catalogId = (i % 2) + 1;
    // For dataset 3, use catalog 1 to match the test expectations
    const actualCatalogId = i === 2 ? 1 : catalogId;

    return createMockDataset({
      id: i + 1,
      name: datasetNames[i] ?? `Test Dataset ${i + 1}`,
      slug: `test-dataset-${i + 1}`,
      description: createRichText(`Description for dataset ${i + 1}`),
      catalog: { id: actualCatalogId } as any, // Mock as object with id property
    });
  });
};
