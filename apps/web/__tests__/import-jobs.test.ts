import {
  fileParsingJob,
  batchProcessingJob,
  eventCreationJob,
  geocodingBatchJob,
} from "../lib/jobs/import-jobs";
import { createSeedManager } from "../lib/seed/index";
import fs from "fs";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { jest } from "@jest/globals";

// Mock external dependencies
jest.mock("fs");
jest.mock("fs/promises");
jest.mock("papaparse");
jest.mock("xlsx");

describe("Import Jobs", () => {
  let seedManager: any;
  let payload: any;
  let mockJob: any;
  let testImportId: string;
  let testCatalogId: string;

  beforeAll(async () => {
    seedManager = createSeedManager();
    await seedManager.initialize();
    payload = seedManager.payload;

    // Create test catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Test Catalog",
        description: "Test catalog for import jobs",
      },
    });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    await seedManager.cleanup();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await payload.delete({ collection: "imports", where: {} });
    await payload.delete({ collection: "events", where: {} });
    await payload.delete({ collection: "location-cache", where: {} });

    // Create test import record
    const importRecord = await payload.create({
      collection: "imports",
      data: {
        fileName: "test-file.csv",
        originalName: "test-file.csv",
        catalog: testCatalogId,
        fileSize: 1024,
        mimeType: "text/csv",
        status: "pending",
        processingStage: "file-parsing",
        importedAt: new Date().toISOString(),
        rowCount: 0,
        errorCount: 0,
        progress: {
          totalRows: 0,
          processedRows: 0,
          geocodedRows: 0,
          createdEvents: 0,
          percentage: 0,
        },
        batchInfo: {
          batchSize: 100,
          currentBatch: 0,
          totalBatches: 0,
        },
        geocodingStats: {
          totalAddresses: 0,
          successfulGeocodes: 0,
          failedGeocodes: 0,
          cachedResults: 0,
          googleApiCalls: 0,
          nominatimApiCalls: 0,
        },
        jobHistory: [],
        metadata: {},
      },
    });
    testImportId = importRecord.id;

    // Mock job object
    mockJob = {
      input: {},
    };

    // Mock payload.jobs.queue
    payload.jobs = {
      queue: jest.fn().mockResolvedValue({}),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("fileParsingJob", () => {
    const mockCsvContent = `title,description,date,location,address
"Test Event 1","Description 1","2024-03-15","Location 1","123 Main St"
"Test Event 2","Description 2","2024-03-16","Location 2","456 Oak Ave"`;

    beforeEach(() => {
      mockJob.input = {
        importId: testImportId,
        filePath: "/tmp/test-file.csv",
        fileName: "test-file.csv",
        fileType: "csv" as const,
      };

      // Mock fs.readFileSync
      (fs.readFileSync as jest.Mock).mockReturnValue(mockCsvContent);

      // Mock fs.unlinkSync
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {});

      // Mock Papa.parse
      const Papa = require("papaparse");
      Papa.parse = jest.fn().mockReturnValue({
        data: [
          {
            title: "Test Event 1",
            description: "Description 1",
            date: "2024-03-15",
            location: "Location 1",
            address: "123 Main St",
          },
          {
            title: "Test Event 2",
            description: "Description 2",
            date: "2024-03-16",
            location: "Location 2",
            address: "456 Oak Ave",
          },
        ],
        errors: [],
      });
    });

    it("should successfully parse CSV file", async () => {
      await fileParsingJob.handler({ job: mockJob, payload });

      // Verify import status was updated
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("processing");
      expect(updatedImport.processingStage).toBe("batch-processing");
      expect(updatedImport.progress.totalRows).toBe(2);
      expect(updatedImport.batchInfo.totalBatches).toBe(1);

      // Verify batch processing jobs were queued
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "batch-processing",
        input: expect.objectContaining({
          importId: testImportId,
          batchNumber: 1,
          batchData: expect.any(Array),
          totalBatches: 1,
        }),
      });
    });

    it("should handle Excel files", async () => {
      mockJob.input.fileType = "xlsx";
      mockJob.input.fileName = "test-file.xlsx";

      const XLSX = require("xlsx");
      XLSX.readFile = jest.fn().mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: {
          Sheet1: {},
        },
      });
      XLSX.utils = {
        sheet_to_json: jest.fn().mockReturnValue([
          ["title", "description", "date", "location", "address"],
          [
            "Test Event 1",
            "Description 1",
            "2024-03-15",
            "Location 1",
            "123 Main St",
          ],
          [
            "Test Event 2",
            "Description 2",
            "2024-03-16",
            "Location 2",
            "456 Oak Ave",
          ],
        ]),
      };

      await fileParsingJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("processing");
      expect(updatedImport.progress.totalRows).toBe(2);
    });

    it("should handle CSV parsing errors", async () => {
      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: [],
        errors: [{ message: "Parse error" }],
      });

      await expect(
        fileParsingJob.handler({ job: mockJob, payload }),
      ).rejects.toThrow();

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("failed");
      expect(updatedImport.errors).toBeDefined();
    });

    it("should filter out invalid rows", async () => {
      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: [
          { title: "Valid Event", date: "2024-03-15" },
          { title: "", date: "2024-03-16" }, // Invalid - no title
          { title: "Another Valid", date: "" }, // Invalid - no date
          { title: "Valid Event 2", date: "2024-03-17" },
        ],
        errors: [],
      });

      await fileParsingJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.totalRows).toBe(4); // Total rows including invalid
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "batch-processing",
        input: expect.objectContaining({
          batchData: expect.arrayContaining([
            expect.objectContaining({ title: "Valid Event" }),
            expect.objectContaining({ title: "Valid Event 2" }),
          ]),
        }),
      });
    });

    it("should handle no valid rows", async () => {
      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: [
          { title: "", date: "" },
          { title: "No Date", date: "" },
        ],
        errors: [],
      });

      await expect(
        fileParsingJob.handler({ job: mockJob, payload }),
      ).rejects.toThrow("No valid rows found");
    });

    it("should create multiple batches for large datasets", async () => {
      const largeDataset = Array.from({ length: 250 }, (_, i) => ({
        title: `Event ${i + 1}`,
        description: `Description ${i + 1}`,
        date: "2024-03-15",
        location: `Location ${i + 1}`,
        address: `${i + 1} Main St`,
      }));

      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: largeDataset,
        errors: [],
      });

      await fileParsingJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.batchInfo.totalBatches).toBe(3); // 250 rows / 100 batch size = 3 batches
      expect(payload.jobs.queue).toHaveBeenCalledTimes(3);
    });

    it("should clean up uploaded file", async () => {
      await fileParsingJob.handler({ job: mockJob, payload });

      expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/test-file.csv");
    });

    it("should handle file cleanup errors gracefully", async () => {
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {
        throw new Error("File deletion failed");
      });

      // Should not throw despite cleanup error
      await expect(
        fileParsingJob.handler({ job: mockJob, payload }),
      ).resolves.not.toThrow();
    });
  });

  describe("batchProcessingJob", () => {
    const mockBatchData = [
      {
        title: "Test Event 1",
        description: "Description 1",
        date: "2024-03-15",
        enddate: "2024-03-16",
        location: "Location 1",
        address: "123 Main St",
        url: "https://example.com",
        category: "Technology",
        tags: "tech,conference",
      },
      {
        title: "Test Event 2",
        description: "Description 2",
        date: "2024-03-17",
        location: "Location 2",
        address: "456 Oak Ave",
        category: "Arts",
        tags: "art,gallery",
      },
    ];

    beforeEach(() => {
      mockJob.input = {
        importId: testImportId,
        batchNumber: 1,
        batchData: mockBatchData,
        totalBatches: 1,
      };
    });

    it("should process batch data correctly", async () => {
      await batchProcessingJob.handler({ job: mockJob, payload });

      // Verify batch info was updated
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.batchInfo.currentBatch).toBe(1);

      // Verify event creation job was queued
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "event-creation",
        input: expect.objectContaining({
          importId: testImportId,
          processedData: expect.arrayContaining([
            expect.objectContaining({
              title: "Test Event 1",
              description: "Description 1",
              date: expect.any(String),
              endDate: expect.any(String),
              location: "Location 1",
              address: "123 Main St",
              url: "https://example.com",
              category: "Technology",
              tags: ["tech", "conference"],
            }),
            expect.objectContaining({
              title: "Test Event 2",
              description: "Description 2",
              date: expect.any(String),
              endDate: null,
              location: "Location 2",
              address: "456 Oak Ave",
              category: "Arts",
              tags: ["art", "gallery"],
            }),
          ]),
          batchNumber: 1,
        }),
      });
    });

    it("should handle missing optional fields", async () => {
      const minimalData = [
        {
          title: "Minimal Event",
          date: "2024-03-15",
        },
      ];

      mockJob.input.batchData = minimalData;

      await batchProcessingJob.handler({ job: mockJob, payload });

      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "event-creation",
        input: expect.objectContaining({
          processedData: expect.arrayContaining([
            expect.objectContaining({
              title: "Minimal Event",
              description: "",
              location: "",
              address: "",
              url: "",
              category: "",
              tags: [],
            }),
          ]),
        }),
      });
    });

    it("should parse tags correctly", async () => {
      const dataWithTags = [
        {
          title: "Event with tags",
          date: "2024-03-15",
          tags: "  tag1  ,  tag2  ,  ,  tag3  ",
        },
      ];

      mockJob.input.batchData = dataWithTags;

      await batchProcessingJob.handler({ job: mockJob, payload });

      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "event-creation",
        input: expect.objectContaining({
          processedData: expect.arrayContaining([
            expect.objectContaining({
              tags: ["tag1", "tag2", "tag3"],
            }),
          ]),
        }),
      });
    });

    it("should handle processing errors", async () => {
      // Mock payload.update to throw error
      const originalUpdate = payload.update;
      payload.update = jest.fn().mockRejectedValue(new Error("Database error"));

      await expect(
        batchProcessingJob.handler({ job: mockJob, payload }),
      ).rejects.toThrow();

      // Restore original method
      payload.update = originalUpdate;
    });
  });

  describe("eventCreationJob", () => {
    const mockProcessedData = [
      {
        title: "Test Event 1",
        description: "Description 1",
        date: "2024-03-15T00:00:00.000Z",
        endDate: null,
        location: "Location 1",
        address: "123 Main St",
        url: "https://example.com",
        category: "Technology",
        tags: ["tech", "conference"],
      },
      {
        title: "Test Event 2",
        description: "Description 2",
        date: "2024-03-17T00:00:00.000Z",
        endDate: "2024-03-18T00:00:00.000Z",
        location: "Location 2",
        address: "456 Oak Ave",
        url: "",
        category: "Arts",
        tags: ["art"],
      },
    ];

    beforeEach(() => {
      mockJob.input = {
        importId: testImportId,
        processedData: mockProcessedData,
        batchNumber: 1,
      };
    });

    it("should create events successfully", async () => {
      await eventCreationJob.handler({ job: mockJob, payload });

      // Verify events were created
      const events = await payload.find({
        collection: "events",
        where: {
          importId: { equals: testImportId },
        },
      });

      expect(events.docs).toHaveLength(2);
      expect(events.docs[0]).toMatchObject({
        title: "Test Event 1",
        description: "Description 1",
        location: "Location 1",
        url: "https://example.com",
        category: "Technology",
        tags: ["tech", "conference"],
      });

      // Verify progress was updated
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.createdEvents).toBe(2);
      expect(updatedImport.progress.processedRows).toBe(2);
    });

    it("should queue geocoding for events with addresses", async () => {
      await eventCreationJob.handler({ job: mockJob, payload });

      // Should queue geocoding job for events with addresses
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "geocoding-batch",
        input: expect.objectContaining({
          importId: testImportId,
          eventIds: expect.any(Array),
          batchNumber: 1,
        }),
      });
    });

    it("should handle event creation errors gracefully", async () => {
      // Mock payload.create to fail for first event
      const originalCreate = payload.create;
      let callCount = 0;
      payload.create = jest.fn().mockImplementation((args) => {
        if (args.collection === "events" && callCount === 0) {
          callCount++;
          throw new Error("Event creation failed");
        }
        callCount++;
        return originalCreate(args);
      });

      await eventCreationJob.handler({ job: mockJob, payload });

      // Should continue processing despite one failure
      const events = await payload.find({
        collection: "events",
        where: {
          importId: { equals: testImportId },
        },
      });

      expect(events.docs).toHaveLength(1); // Only second event created

      // Restore original method
      payload.create = originalCreate;
    });

    it("should update processing stage when last batch", async () => {
      // Update import to simulate this being the last batch
      await payload.update({
        collection: "imports",
        id: testImportId,
        data: {
          "batchInfo.totalBatches": 1,
          "batchInfo.currentBatch": 0,
        },
      });

      await eventCreationJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.processingStage).toBe("geocoding");
    });
  });

  describe("geocodingBatchJob", () => {
    let testEventIds: string[];

    beforeEach(async () => {
      // Create test events with addresses
      const event1 = await payload.create({
        collection: "events",
        data: {
          title: "Event 1",
          description: "Description 1",
          date: new Date().toISOString(),
          location: "Location 1",
          importId: testImportId,
          geocoding: {
            originalAddress: "123 Main St, San Francisco, CA",
            needsGeocoding: true,
            provider: null,
            confidence: null,
            normalizedAddress: null,
            geocodedAt: null,
          },
        },
      });

      const event2 = await payload.create({
        collection: "events",
        data: {
          title: "Event 2",
          description: "Description 2",
          date: new Date().toISOString(),
          location: "Location 2",
          importId: testImportId,
          geocoding: {
            originalAddress: "456 Oak Ave, New York, NY",
            needsGeocoding: true,
            provider: null,
            confidence: null,
            normalizedAddress: null,
            geocodedAt: null,
          },
        },
      });

      testEventIds = [event1.id, event2.id];

      mockJob.input = {
        importId: testImportId,
        eventIds: testEventIds,
        batchNumber: 1,
      };
    });

    it("should geocode events successfully", async () => {
      // Mock GeocodingService
      const mockGeocodingService = {
        geocode: jest.fn().mockResolvedValue({
          latitude: 37.7749,
          longitude: -122.4194,
          confidence: 0.9,
          provider: "google",
          normalizedAddress: "123 Main St, San Francisco, CA 94102, USA",
        }),
      };

      // Mock the GeocodingService constructor
      const originalGeocodingService =
        require("../lib/services/geocoding/GeocodingService").GeocodingService;
      require("../lib/services/geocoding/GeocodingService").GeocodingService =
        jest.fn().mockImplementation(() => mockGeocodingService);

      await geocodingBatchJob.handler({ job: mockJob, payload });

      // Verify events were updated with geocoding results
      const updatedEvent1 = await payload.findByID({
        collection: "events",
        id: testEventIds[0],
      });

      expect(updatedEvent1.latitude).toBe(37.7749);
      expect(updatedEvent1.longitude).toBe(-122.4194);
      expect(updatedEvent1.geocoding.provider).toBe("google");
      expect(updatedEvent1.geocoding.confidence).toBe(0.9);
      expect(updatedEvent1.geocoding.needsGeocoding).toBe(false);

      // Verify progress was updated
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.geocodedRows).toBe(2);

      // Restore original
      require("../lib/services/geocoding/GeocodingService").GeocodingService =
        originalGeocodingService;
    });

    it("should handle geocoding failures gracefully", async () => {
      const mockGeocodingService = {
        geocode: jest
          .fn()
          .mockResolvedValueOnce({
            latitude: 37.7749,
            longitude: -122.4194,
            confidence: 0.9,
            provider: "google",
            normalizedAddress: "123 Main St, San Francisco, CA 94102, USA",
          })
          .mockRejectedValueOnce(new Error("Geocoding failed")),
      };

      const originalGeocodingService =
        require("../lib/services/geocoding/GeocodingService").GeocodingService;
      require("../lib/services/geocoding/GeocodingService").GeocodingService =
        jest.fn().mockImplementation(() => mockGeocodingService);

      await geocodingBatchJob.handler({ job: mockJob, payload });

      // First event should be geocoded, second should remain unchanged
      const updatedEvent1 = await payload.findByID({
        collection: "events",
        id: testEventIds[0],
      });
      const updatedEvent2 = await payload.findByID({
        collection: "events",
        id: testEventIds[1],
      });

      expect(updatedEvent1.latitude).toBe(37.7749);
      expect(updatedEvent2.latitude).toBeUndefined();

      // Progress should reflect partial success
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.geocodedRows).toBe(1);

      // Restore original
      require("../lib/services/geocoding/GeocodingService").GeocodingService =
        originalGeocodingService;
    });

    it("should complete import when geocoding is finished", async () => {
      // Set up import to simulate completion
      await payload.update({
        collection: "imports",
        id: testImportId,
        data: {
          "progress.createdEvents": 2,
          "progress.geocodedRows": 0,
        },
      });

      const mockGeocodingService = {
        geocode: jest.fn().mockResolvedValue({
          latitude: 37.7749,
          longitude: -122.4194,
          confidence: 0.9,
          provider: "google",
          normalizedAddress: "123 Main St, San Francisco, CA 94102, USA",
        }),
      };

      const originalGeocodingService =
        require("../lib/services/geocoding/GeocodingService").GeocodingService;
      require("../lib/services/geocoding/GeocodingService").GeocodingService =
        jest.fn().mockImplementation(() => mockGeocodingService);

      await geocodingBatchJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("completed");
      expect(updatedImport.processingStage).toBe("completed");
      expect(updatedImport.completedAt).toBeDefined();

      // Restore original
      require("../lib/services/geocoding/GeocodingService").GeocodingService =
        originalGeocodingService;
    });

    it("should skip events without addresses", async () => {
      // Update one event to have no address
      await payload.update({
        collection: "events",
        id: testEventIds[0],
        data: {
          "geocoding.originalAddress": null,
        },
      });

      const mockGeocodingService = {
        geocode: jest.fn().mockResolvedValue({
          latitude: 37.7749,
          longitude: -122.4194,
          confidence: 0.9,
          provider: "google",
          normalizedAddress: "456 Oak Ave, New York, NY 10001, USA",
        }),
      };

      const originalGeocodingService =
        require("../lib/services/geocoding/GeocodingService").GeocodingService;
      require("../lib/services/geocoding/GeocodingService").GeocodingService =
        jest.fn().mockImplementation(() => mockGeocodingService);

      await geocodingBatchJob.handler({ job: mockJob, payload });

      // Only second event should be geocoded
      expect(mockGeocodingService.geocode).toHaveBeenCalledTimes(1);

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.geocodedRows).toBe(1);

      // Restore original
      require("../lib/services/geocoding/GeocodingService").GeocodingService =
        originalGeocodingService;
    });
  });
});
