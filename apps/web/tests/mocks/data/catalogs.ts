/**
 * @module
 */
import type { Catalog } from "@/payload-types";

import { createRichText } from "../utils/factories";

export const createMockCatalog = (overrides: Partial<Catalog> = {}): Catalog => ({
  id: 1,
  name: "Test Catalog",
  description: createRichText("A test catalog description"),
  slug: "test-catalog",
  _status: "published" as const,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createMockCatalogs = (count: number = 3): Catalog[] => {
  return Array.from({ length: count }, (_, i) =>
    createMockCatalog({
      id: i + 1,
      name: `Test Catalog ${i + 1}`,
      slug: `test-catalog-${i + 1}`,
      description: createRichText(`Description for catalog ${i + 1}`),
    })
  );
};
