/* eslint-disable sonarjs/no-hardcoded-ip -- test fixtures use example IPs */
/**
 * Unit tests for Audit Log IP Cleanup Job Handler.
 *
 * Tests the audit-log-ip-cleanup job which clears raw IP addresses
 * from audit log entries older than 30 days while preserving hashed IPs.
 *
 * @module
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

import { auditLogIpCleanupJob } from "@/lib/jobs/handlers/audit-log-ip-cleanup-job";
import { logError } from "@/lib/logger";

describe.sequential("auditLogIpCleanupJob", () => {
  let mockPayload: any;

  const createContext = () => ({ job: { id: "ip-cleanup-job-1" }, req: { payload: mockPayload } });

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
    };
  });

  it("should return zero counts when no entries found", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [], totalDocs: 0 });

    const result = await auditLogIpCleanupJob.handler(createContext());

    expect(result.output).toEqual({ success: true, cleared: 0, totalEligible: 0 });

    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: "audit-log",
      where: { and: [{ timestamp: { less_than: expect.any(String) } }, { ipAddress: { exists: true } }] },
      limit: 500,
      overrideAccess: true,
    });
  });

  it("should update each entry with ipAddress null and return correct count", async () => {
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        { id: 1, ipAddress: "192.168.1.1" },
        { id: 2, ipAddress: "10.0.0.1" },
        { id: 3, ipAddress: "172.16.0.1" },
      ],
      totalDocs: 3,
    });

    const result = await auditLogIpCleanupJob.handler(createContext());

    expect(mockPayload.update).toHaveBeenCalledTimes(3);

    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "audit-log",
      id: 1,
      data: { ipAddress: null },
      overrideAccess: true,
    });
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "audit-log",
      id: 2,
      data: { ipAddress: null },
      overrideAccess: true,
    });
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "audit-log",
      id: 3,
      data: { ipAddress: null },
      overrideAccess: true,
    });

    expect(result.output).toEqual({ success: true, cleared: 3, totalEligible: 3 });
  });

  it("should log error and continue when a per-entry update throws", async () => {
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        { id: 10, ipAddress: "192.168.1.1" },
        { id: 11, ipAddress: "10.0.0.1" },
      ],
      totalDocs: 2,
    });

    mockPayload.update.mockRejectedValueOnce(new Error("Update failed for entry 10")).mockResolvedValueOnce({});

    const result = await auditLogIpCleanupJob.handler(createContext());

    // First entry failed, second succeeded
    expect(result.output.cleared).toBe(1);
    expect(result.output.totalEligible).toBe(2);
    expect(result.output.success).toBe(true);

    expect(logError).toHaveBeenCalledWith(expect.any(Error), "Failed to clear IP from audit entry", { entryId: 10 });
  });

  it("should throw on overall handler error for retry", async () => {
    mockPayload.find.mockRejectedValueOnce(new Error("Database connection lost"));

    await expect(auditLogIpCleanupJob.handler(createContext() as any)).rejects.toThrow("Database connection lost");
  });
});
