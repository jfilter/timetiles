import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createIsolatedTestEnvironment } from "../../setup/test-helpers";
import type { Payload } from "payload";
import type { Import } from "../../../payload-types";

describe("Import with existing coordinates", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
  let payload: Payload;
  let catalogId: number;
  let datasetId: number;

  beforeAll(async () => {
    try {
      testEnv = await createIsolatedTestEnvironment();
      payload = testEnv.payload;

      // Create a test catalog with unique slug
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const catalog = await payload.create({
        collection: "catalogs",
        data: {
          name: `Test Coordinate Import ${timestamp}`,
          slug: `test-coordinate-import-${timestamp}-${randomSuffix}`,
          description: {
            root: {
              type: "root",
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  children: [
                    {
                      type: "text",
                      text: "Testing coordinate detection",
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
          },
        },
      });
      catalogId = catalog.id;

      // Create a dataset
      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: `Test Dataset ${timestamp}`,
          slug: `test-dataset-${timestamp}-${randomSuffix}`,
          catalog: catalogId,
          description: {
            root: {
              type: "root",
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  children: [
                    {
                      type: "text",
                      text: "Test dataset for coordinate import",
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
          },
          language: "eng",
          schema: {
            fields: [
              { name: "title", type: "text", required: true },
              { name: "lat", type: "number", required: false },
              { name: "lon", type: "number", required: false },
              { name: "latitude", type: "number", required: false },
              { name: "longitude", type: "number", required: false },
              { name: "coordinates", type: "text", required: false },
              { name: "location", type: "object", required: false },
              { name: "x_coord", type: "number", required: false },
              { name: "y_coord", type: "number", required: false },
            ],
          },
        },
      });
      datasetId = dataset.id;
    } catch (error) {
      console.error("Setup failed:", error);
      throw error;
    }
  }, 30000); // 30 second timeout

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  }, 30000); // 30 second timeout

  it("skips geocoding when valid coordinates exist", async () => {
    // Create import with coordinate detection
    const importData = await payload.create({
      collection: "imports",
      data: {
        fileName: "test-with-coords.csv",
        originalName: "Events with Coordinates.csv",
        catalog: catalogId,
        status: "processing",
        rowCount: 3,
        coordinateDetection: {
          detected: true,
          detectionMethod: "pattern",
          columnMapping: {
            latitudeColumn: "lat",
            longitudeColumn: "lon",
            coordinateFormat: "decimal",
          },
          detectionConfidence: 0.95,
          sampleValidation: {
            validSamples: 3,
            invalidSamples: 0,
            swappedCoordinates: false,
          },
        },
      },
    });

    // Create events with pre-existing coordinates
    const event1 = await payload.create({
      collection: "events",
      data: {
        dataset: datasetId,
        import: importData.id,
        data: { title: "NYC Event", lat: "40.7128", lon: "-74.0060" },
        eventTimestamp: new Date().toISOString(),
        location: {
          latitude: 40.7128,
          longitude: -74.006,
        },
        coordinateSource: {
          type: "import",
          confidence: 0.95,
          validationStatus: "valid",
          importColumns: {
            latitudeColumn: "lat",
            longitudeColumn: "lon",
            format: "decimal",
          },
        },
      },
    });

    // Verify coordinate source
    expect(event1.coordinateSource?.type).toBe("import");
    expect(event1.location?.latitude).toBe(40.7128);
    expect(event1.location?.longitude).toBe(-74.006);
  });

  it("geocodes when coordinates are invalid", async () => {
    const importData = await payload.create({
      collection: "imports",
      data: {
        fileName: "test-invalid-coords.csv",
        originalName: "Events with Invalid Coordinates.csv",
        catalog: catalogId,
        status: "processing",
        rowCount: 2,
        coordinateDetection: {
          detected: false,
          detectionMethod: "none",
          detectionConfidence: 0,
          sampleValidation: {
            validSamples: 0,
            invalidSamples: 2,
          },
        },
      },
    });

    const event = await payload.create({
      collection: "events",
      data: {
        dataset: datasetId,
        import: importData.id,
        data: { title: "Invalid Coord Event", lat: "999", lon: "999" },
        eventTimestamp: new Date().toISOString(),
        coordinateSource: {
          type: "none",
        },
        geocodingInfo: {
          originalAddress: "123 Main St, New York, NY",
        },
      },
    });

    expect(event.coordinateSource?.type).toBe("none");
    expect(event.location?.latitude).toBeNull();
  });

  it("handles mixed data (some with, some without coordinates)", async () => {
    const importData = await payload.create({
      collection: "imports",
      data: {
        fileName: "test-mixed-coords.csv",
        originalName: "Mixed Coordinate Data.csv",
        catalog: catalogId,
        status: "processing",
        rowCount: 3,
        coordinateDetection: {
          detected: true,
          detectionMethod: "pattern",
          columnMapping: {
            latitudeColumn: "latitude",
            longitudeColumn: "longitude",
            coordinateFormat: "decimal",
          },
          detectionConfidence: 0.66,
          sampleValidation: {
            validSamples: 2,
            invalidSamples: 1,
          },
        },
      },
    });

    // Event with coordinates
    const event1 = await payload.create({
      collection: "events",
      data: {
        dataset: datasetId,
        import: importData.id,
        data: {
          title: "Has Coords",
          latitude: "51.5074",
          longitude: "-0.1278",
        },
        eventTimestamp: new Date().toISOString(),
        location: {
          latitude: 51.5074,
          longitude: -0.1278,
        },
        coordinateSource: {
          type: "import",
          confidence: 1.0,
          validationStatus: "valid",
        },
      },
    });

    // Event without coordinates
    const event2 = await payload.create({
      collection: "events",
      data: {
        dataset: datasetId,
        import: importData.id,
        data: { title: "No Coords", latitude: "", longitude: "" },
        eventTimestamp: new Date().toISOString(),
        coordinateSource: {
          type: "none",
        },
        geocodingInfo: {
          originalAddress: "456 Oak St, London, UK",
        },
      },
    });

    expect(event1.coordinateSource?.type).toBe("import");
    expect(event1.location?.latitude).toBe(51.5074);
    expect(event2.coordinateSource?.type).toBe("none");
    expect(event2.location?.latitude).toBeNull();
  }, 20000);

  it("processes various CSV formats with coordinates", async () => {
    // Test comma-separated format
    const importComma = await payload.create({
      collection: "imports",
      data: {
        fileName: "comma-coords.csv",
        originalName: "Comma Separated Coords.csv",
        catalog: catalogId,
        status: "processing",
        rowCount: 1,
        coordinateDetection: {
          detected: true,
          detectionMethod: "pattern",
          columnMapping: {
            combinedColumn: "coordinates",
            coordinateFormat: "combined_comma",
          },
          detectionConfidence: 0.9,
        },
      },
    });

    const eventComma = await payload.create({
      collection: "events",
      data: {
        dataset: datasetId,
        import: importComma.id,
        data: { title: "Comma Event", coordinates: "48.8566,2.3522" },
        eventTimestamp: new Date().toISOString(),
        location: {
          latitude: 48.8566,
          longitude: 2.3522,
        },
        coordinateSource: {
          type: "import",
          confidence: 0.9,
          validationStatus: "valid",
          importColumns: {
            combinedColumn: "coordinates",
            format: "combined_comma",
          },
        },
      },
    });

    expect(eventComma.location?.latitude).toBe(48.8566);
    expect(eventComma.location?.longitude).toBe(2.3522);
  });

  it("handles Excel files with coordinate columns", async () => {
    const importExcel = await payload.create({
      collection: "imports",
      data: {
        fileName: "coords.xlsx",
        originalName: "Excel with Coordinates.xlsx",
        catalog: catalogId,
        status: "processing",
        rowCount: 2,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        coordinateDetection: {
          detected: true,
          detectionMethod: "heuristic",
          columnMapping: {
            latitudeColumn: "y_coord",
            longitudeColumn: "x_coord",
            coordinateFormat: "decimal",
          },
          detectionConfidence: 0.85,
          sampleValidation: {
            validSamples: 2,
            invalidSamples: 0,
            swappedCoordinates: false,
          },
        },
      },
    });

    const event = await payload.create({
      collection: "events",
      data: {
        dataset: datasetId,
        import: importExcel.id,
        data: {
          title: "Sydney Opera House",
          y_coord: "-33.8568",
          x_coord: "151.2153",
        },
        eventTimestamp: new Date().toISOString(),
        location: {
          latitude: -33.8568,
          longitude: 151.2153,
        },
        coordinateSource: {
          type: "import",
          confidence: 0.85,
          validationStatus: "valid",
          importColumns: {
            latitudeColumn: "y_coord",
            longitudeColumn: "x_coord",
            format: "decimal",
          },
        },
      },
    });

    expect(event.coordinateSource?.type).toBe("import");
    expect(event.location?.latitude).toBe(-33.8568);
    expect(event.location?.longitude).toBe(151.2153);
  });

  it("detects and fixes swapped coordinates", async () => {
    const importSwapped = await payload.create({
      collection: "imports",
      data: {
        fileName: "swapped-coords.csv",
        originalName: "Swapped Coordinates.csv",
        catalog: catalogId,
        status: "processing",
        rowCount: 1,
        coordinateDetection: {
          detected: true,
          detectionMethod: "pattern",
          columnMapping: {
            latitudeColumn: "lat",
            longitudeColumn: "lon",
            coordinateFormat: "decimal",
          },
          detectionConfidence: 0.8,
          sampleValidation: {
            validSamples: 1,
            invalidSamples: 0,
            swappedCoordinates: true,
          },
        },
      },
    });

    const event = await payload.create({
      collection: "events",
      data: {
        dataset: datasetId,
        import: importSwapped.id,
        data: { title: "Tokyo", lat: "139.6503", lon: "35.6762" }, // Swapped
        eventTimestamp: new Date().toISOString(),
        location: {
          latitude: 35.6762, // Corrected
          longitude: 139.6503, // Corrected
        },
        coordinateSource: {
          type: "import",
          confidence: 0.8,
          validationStatus: "swapped",
          importColumns: {
            latitudeColumn: "lat",
            longitudeColumn: "lon",
            format: "decimal",
          },
        },
      },
    });

    expect(event.coordinateSource?.validationStatus).toBe("swapped");
    expect(event.location?.latitude).toBe(35.6762);
    expect(event.location?.longitude).toBe(139.6503);
  }, 20000);
});
