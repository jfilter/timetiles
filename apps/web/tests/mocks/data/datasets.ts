import type { Dataset } from "@/payload-types";

const createRichTextDescription = (text: string) => ({
  root: {
    type: "root",
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [
          {
            type: "text",
            text,
            version: 1,
          },
        ],
      },
    ],
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    version: 1,
  },
});

export const createMockDataset = (overrides: Partial<Dataset> = {}): Dataset => ({
  id: 1,
  name: "Test Dataset",
  description: createRichTextDescription("A test dataset description"),
  catalog: 1,
  slug: "test-dataset",
  language: "eng",
  status: "active" as const,
  isPublic: true,
  schema: { type: "object", properties: {} },
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
      name: datasetNames[i] || `Test Dataset ${i + 1}`,
      slug: `test-dataset-${i + 1}`,
      description: createRichTextDescription(`Description for dataset ${i + 1}`),
      catalog: { id: actualCatalogId } as any, // Mock as object with id property
    });
  });
};
