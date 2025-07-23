import type { Catalog } from "@/payload-types";

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

export const createMockCatalog = (overrides: Partial<Catalog> = {}): Catalog => ({
  id: 1,
  name: "Test Catalog",
  description: createRichTextDescription("A test catalog description"),
  slug: "test-catalog",
  status: "active" as const,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createMockCatalogs = (count: number = 3): Catalog[] => {
  return Array.from({ length: count }, (_, i) => createMockCatalog({
    id: i + 1,
    name: `Test Catalog ${i + 1}`,
    slug: `test-catalog-${i + 1}`,
    description: createRichTextDescription(`Description for catalog ${i + 1}`),
  }));
};