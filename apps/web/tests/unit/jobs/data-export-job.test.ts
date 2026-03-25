/* eslint-disable sonarjs/publicly-writable-directories -- test fixtures use mock paths */
/**
 * Unit tests for Data Export Job Handler.
 *
 * Tests the data-export job which creates user data export archives,
 * updates export records, and sends notification emails.
 *
 * @module
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

const mockExecuteExport = vi.fn();

vi.mock("@/lib/config/env", () => ({
  getEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://example.com", NEXT_PUBLIC_PAYLOAD_URL: "https://example.com" }),
}));

vi.mock("@/lib/export/service", () => ({ createDataExportService: () => ({ executeExport: mockExecuteExport }) }));

vi.mock("@/lib/export/emails", () => ({
  sendExportReadyEmail: vi.fn().mockResolvedValue(undefined),
  sendExportFailedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/utils/base-url", () => ({ getBaseUrl: () => "https://example.com" }));

vi.mock("@/lib/utils/relation-id", () => ({
  requireRelationId: (value: any) => {
    if (value == null) throw new Error("Required relation ID is missing");
    if (typeof value === "object") return value.id;
    return value;
  },
}));

import { sendExportFailedEmail, sendExportReadyEmail } from "@/lib/export/emails";
import { dataExportJob } from "@/lib/jobs/handlers/data-export-job";
import { logError } from "@/lib/logger";

describe.sequential("dataExportJob", () => {
  let mockPayload: any;

  const createContext = (input?: { exportId?: number }) => ({
    input,
    job: { id: "export-job-1", input },
    req: { payload: mockPayload },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-apply mocked implementations after clearAllMocks
    mockExecuteExport.mockResolvedValue({
      filePath: "/tmp/exports/export-42.zip",
      fileSize: 2 * 1024 * 1024,
      recordCounts: { events: 100, datasets: 2 },
    });

    const emails = await import("@/lib/export/emails");
    (emails.sendExportReadyEmail as any).mockResolvedValue(undefined);
    (emails.sendExportFailedEmail as any).mockResolvedValue(undefined);

    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
    };

    // Default: findByID returns export record then user
    mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "data-exports") {
        return Promise.resolve({ id: 42, user: 100, status: "pending" });
      }
      if (collection === "users") {
        return Promise.resolve({ id: 100, email: "test@example.com", firstName: "Test", locale: "en" });
      }
      return Promise.resolve(null);
    });
  });

  it("should throw when exportId is not provided", async () => {
    const context = createContext();

    await expect(dataExportJob.handler(context as any)).rejects.toThrow("Export ID not provided");
  });

  it("should throw when payload is not available", async () => {
    const context = {
      input: { exportId: 42 },
      job: { id: "export-job-1", input: { exportId: 42 } },
      req: { payload: undefined },
    };

    await expect(dataExportJob.handler(context as any)).rejects.toThrow("Payload not available");
  });

  it("should throw and call handleExportFailure when export record not found", async () => {
    mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "data-exports") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const context = createContext({ exportId: 42 });

    await expect(dataExportJob.handler(context as any)).rejects.toThrow("Export record not found: 42");

    // handleExportFailure should have been called - it tries to find the record again
    // and updates status to failed
    expect(mockPayload.findByID).toHaveBeenCalled();
  });

  it("should throw and call handleExportFailure when user not found", async () => {
    mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "data-exports") {
        return Promise.resolve({ id: 42, user: 100, status: "pending" });
      }
      if (collection === "users") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const context = createContext({ exportId: 42 });

    await expect(dataExportJob.handler(context as any)).rejects.toThrow("User not found: 100");

    // handleExportFailure updates record to failed
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "data-exports",
        id: 42,
        data: expect.objectContaining({ status: "failed" }),
      })
    );
  });

  it("should execute export, update record to ready, and send email on success", async () => {
    const context = createContext({ exportId: 42 });

    const result = await dataExportJob.handler(context as any);

    // Should update to processing first
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "data-exports",
      id: 42,
      data: { status: "processing" },
      overrideAccess: true,
    });

    // Should update to ready with results
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "data-exports",
      id: 42,
      data: expect.objectContaining({
        status: "ready",
        completedAt: expect.any(String),
        expiresAt: expect.any(String),
        filePath: "/tmp/exports/export-42.zip",
        fileSize: 2 * 1024 * 1024,
      }),
      overrideAccess: true,
    });

    // Should send ready email
    expect(sendExportReadyEmail).toHaveBeenCalledWith(
      mockPayload,
      "test@example.com",
      "Test",
      "https://example.com/api/data-exports/42/download",
      expect.any(String),
      expect.any(Number),
      "en"
    );

    expect(result.output).toEqual(expect.objectContaining({ success: true, exportId: 42, fileSize: 2 * 1024 * 1024 }));
  });

  it("should call handleExportFailure and send failure email when export throws", async () => {
    mockExecuteExport.mockRejectedValueOnce(new Error("Export generation failed"));

    // handleExportFailure will look up the export record and user to send email
    mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "data-exports") {
        return Promise.resolve({ id: 42, user: 100, status: "processing" });
      }
      if (collection === "users") {
        return Promise.resolve({ id: 100, email: "test@example.com", firstName: "Test", locale: "en" });
      }
      return Promise.resolve(null);
    });

    const context = createContext({ exportId: 42 });

    await expect(dataExportJob.handler(context as any)).rejects.toThrow("Export generation failed");

    // handleExportFailure updates to failed
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "data-exports",
        id: 42,
        data: expect.objectContaining({ status: "failed", errorLog: "Export generation failed" }),
      })
    );

    // Failure email sent
    expect(sendExportFailedEmail).toHaveBeenCalledWith(
      mockPayload,
      "test@example.com",
      "Test",
      "Export generation failed",
      "en"
    );
  });

  it("should handle handleExportFailure itself throwing without propagating", async () => {
    mockExecuteExport.mockRejectedValueOnce(new Error("Export failed"));

    // Main flow findByID calls succeed, but handleExportFailure's findByID throws
    let findByIDCallCount = 0;
    mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
      findByIDCallCount++;
      // Calls 1-2 are in the main flow (export record + user), call 3+ is in handleExportFailure
      if (findByIDCallCount <= 2) {
        if (collection === "data-exports") {
          return Promise.resolve({ id: 42, user: 100, status: "pending" });
        }
        if (collection === "users") {
          return Promise.resolve({ id: 100, email: "test@example.com", firstName: "Test", locale: "en" });
        }
      }
      return Promise.reject(new Error("DB error in failure handler"));
    });

    const context = createContext({ exportId: 42 });

    // The original error should propagate, not the handleExportFailure error
    await expect(dataExportJob.handler(context as any)).rejects.toThrow("Export failed");

    // handleExportFailure's internal error should be logged
    expect(logError).toHaveBeenCalledWith(expect.any(Error), "Failed to update export status after error", {
      exportId: 42,
    });
  });
});
