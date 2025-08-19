/**
 * @module
 */
// Utility functions for creating test data with common patterns

export const createDateRange = (startDate: string, days: number) => {
  const start = new Date(startDate);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date.toISOString();
  });
};

export const createCoordinateGrid = (centerLat: number, centerLng: number, count: number, spread: number = 0.01) => {
  return Array.from({ length: count }, () => ({
    latitude: centerLat + (Math.random() - 0.5) * spread,
    longitude: centerLng + (Math.random() - 0.5) * spread,
  }));
};

export const createTestFile = (name: string, content: string, type: string = "text/csv") => {
  return new File([content], name, { type });
};

export const createCSVContent = (headers: string[], rows: string[][]) => {
  const csvRows = [headers.join(","), ...rows.map((row) => row.join(","))];
  return csvRows.join("\n");
};

// Rich text helpers for Payload CMS
export const createRichText = (text: string) => ({
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

export const createRichTextWithFormatting = (text: string, formatting: "bold" | "italic" = "bold") => ({
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
            format: formatting === "bold" ? 1 : 2, // 1 = bold, 2 = italic
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
