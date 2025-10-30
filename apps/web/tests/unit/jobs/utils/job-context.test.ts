/**
 * Unit tests for job context utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  type EventCreationJobPayload,
  extractEventCreationContext,
  extractFileParsingContext,
  type FileParsingJobPayload,
  type JobHandlerContext,
} from "../../../../lib/jobs/utils/job-context";

describe("Job Context Utilities", () => {
  describe("extractFileParsingContext", () => {
    it("should extract payload from req.payload", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: {
          payload: mockPayload,
        },
        input: {
          importJobId: 123,
          filePath: "/path/to/file.csv",
          fileType: "csv" as const,
        },
      };

      const result = extractFileParsingContext(context);
      expect(result.payload).toBe(mockPayload);
      expect(result.input.importJobId).toBe(123);
      expect(result.input.filePath).toBe("/path/to/file.csv");
      expect(result.input.fileType).toBe("csv");
    });

    it("should extract payload from legacy context.payload", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        payload: mockPayload,
        input: {
          importJobId: 456,
          filePath: "/path/to/file.xlsx",
          fileType: "xlsx" as const,
        },
      };

      const result = extractFileParsingContext(context);
      expect(result.payload).toBe(mockPayload);
      expect(result.input.importJobId).toBe(456);
    });

    it("should prefer req.payload over legacy context.payload", () => {
      const reqPayload = { collections: {}, source: "req" } as any;
      const contextPayload = { collections: {}, source: "context" } as any;
      const context: JobHandlerContext = {
        req: {
          payload: reqPayload,
        },
        payload: contextPayload,
        input: {
          importJobId: 789,
          filePath: "/path/to/file.csv",
          fileType: "csv" as const,
        },
      };

      const result = extractFileParsingContext(context);
      expect(result.payload).toBe(reqPayload);
      expect((result.payload as any).source).toBe("req");
    });

    it("should extract input with all required fields", () => {
      const mockPayload = { collections: {} } as any;
      const input: FileParsingJobPayload["input"] = {
        importJobId: 999,
        filePath: "/uploads/data.csv",
        fileType: "csv",
      };
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
        input,
      };

      const result = extractFileParsingContext(context);
      expect(result.input).toEqual(input);
    });

    it("should throw error when payload is missing", () => {
      const context: JobHandlerContext = {
        input: {
          importJobId: 123,
          filePath: "/path/to/file.csv",
          fileType: "csv" as const,
        },
      };

      expect(() => extractFileParsingContext(context)).toThrow("Payload instance not found in job context");
    });

    it("should throw error when payload is null", () => {
      const context: JobHandlerContext = {
        req: { payload: null as any },
        input: {
          importJobId: 123,
          filePath: "/path/to/file.csv",
          fileType: "csv" as const,
        },
      };

      expect(() => extractFileParsingContext(context)).toThrow("Payload instance not found in job context");
    });

    it("should throw error when importJobId is missing", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
        input: {
          filePath: "/path/to/file.csv",
          fileType: "csv" as const,
        } as any,
      };

      expect(() => extractFileParsingContext(context)).toThrow("Import Job ID is required for file parsing job");
    });

    it("should throw error when importJobId is null", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
        input: {
          importJobId: null as any,
          filePath: "/path/to/file.csv",
          fileType: "csv" as const,
        },
      };

      expect(() => extractFileParsingContext(context)).toThrow("Import Job ID is required for file parsing job");
    });

    it("should throw error when input is missing", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
      };

      expect(() => extractFileParsingContext(context)).toThrow("Import Job ID is required for file parsing job");
    });

    it("should handle additional context properties", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
        input: {
          importJobId: 123,
          filePath: "/path/to/file.csv",
          fileType: "csv" as const,
        },
        job: {
          id: "job-123",
          taskStatus: { progress: 50 },
        },
        customProperty: "custom-value",
      };

      const result = extractFileParsingContext(context);
      expect(result.payload).toBe(mockPayload);
      expect(result.input.importJobId).toBe(123);
    });
  });

  describe("extractEventCreationContext", () => {
    it("should extract payload from req.payload", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: {
          payload: mockPayload,
        },
        input: {
          importJobId: 123,
          processedData: [{ id: 1 }, { id: 2 }],
          batchNumber: 1,
        },
      };

      const result = extractEventCreationContext(context);
      expect(result.payload).toBe(mockPayload);
      expect(result.input.importJobId).toBe(123);
      expect(result.input.processedData).toHaveLength(2);
      expect(result.input.batchNumber).toBe(1);
    });

    it("should extract payload from legacy context.payload", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        payload: mockPayload,
        input: {
          importJobId: 456,
          processedData: [],
          batchNumber: 2,
        },
      };

      const result = extractEventCreationContext(context);
      expect(result.payload).toBe(mockPayload);
      expect(result.input.importJobId).toBe(456);
    });

    it("should prefer req.payload over legacy context.payload", () => {
      const reqPayload = { collections: {}, source: "req" } as any;
      const contextPayload = { collections: {}, source: "context" } as any;
      const context: JobHandlerContext = {
        req: {
          payload: reqPayload,
        },
        payload: contextPayload,
        input: {
          importJobId: 789,
          processedData: [{ data: "test" }],
          batchNumber: 3,
        },
      };

      const result = extractEventCreationContext(context);
      expect(result.payload).toBe(reqPayload);
      expect((result.payload as any).source).toBe("req");
    });

    it("should validate importJobId presence", () => {
      const mockPayload = { collections: {} } as any;
      const input: EventCreationJobPayload["input"] = {
        importJobId: 999,
        processedData: [{ field: "value" }],
        batchNumber: 5,
      };
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
        input,
      };

      const result = extractEventCreationContext(context);
      expect(result.input).toEqual(input);
    });

    it("should throw error when payload is missing", () => {
      const context: JobHandlerContext = {
        input: {
          importJobId: 123,
          processedData: [],
          batchNumber: 1,
        },
      };

      expect(() => extractEventCreationContext(context)).toThrow("Payload instance not found in job context");
    });

    it("should throw error when payload is null", () => {
      const context: JobHandlerContext = {
        req: { payload: null as any },
        input: {
          importJobId: 123,
          processedData: [],
          batchNumber: 1,
        },
      };

      expect(() => extractEventCreationContext(context)).toThrow("Payload instance not found in job context");
    });

    it("should throw error when importJobId is missing", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
        input: {
          processedData: [],
          batchNumber: 1,
        } as any,
      };

      expect(() => extractEventCreationContext(context)).toThrow("Import Job ID is required for event creation job");
    });

    it("should throw error when importJobId is null", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
        input: {
          importJobId: null as any,
          processedData: [],
          batchNumber: 1,
        },
      };

      expect(() => extractEventCreationContext(context)).toThrow("Import Job ID is required for event creation job");
    });

    it("should throw error when input is missing", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
      };

      expect(() => extractEventCreationContext(context)).toThrow("Import Job ID is required for event creation job");
    });

    it("should handle empty processedData array", () => {
      const mockPayload = { collections: {} } as any;
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
        input: {
          importJobId: 123,
          processedData: [],
          batchNumber: 1,
        },
      };

      const result = extractEventCreationContext(context);
      expect(result.input.processedData).toEqual([]);
    });

    it("should handle large processedData arrays", () => {
      const mockPayload = { collections: {} } as any;
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
      const context: JobHandlerContext = {
        req: { payload: mockPayload },
        input: {
          importJobId: 123,
          processedData: largeArray,
          batchNumber: 10,
        },
      };

      const result = extractEventCreationContext(context);
      expect(result.input.processedData).toHaveLength(1000);
      expect(result.input.batchNumber).toBe(10);
    });
  });
});
