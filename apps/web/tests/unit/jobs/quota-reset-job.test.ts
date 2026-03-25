/**
 * Unit tests for quota reset job.
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

const mockResetAllDailyCounters = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/quota-service", () => ({
  createQuotaService: vi.fn(() => ({ resetAllDailyCounters: mockResetAllDailyCounters })),
}));

import { quotaResetJobConfig } from "@/lib/jobs/handlers/quota-reset-job/index";

describe("quotaResetJob", () => {
  let mockPayload: {
    find: ReturnType<typeof vi.fn>;
    findByID: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  const createMockContext = () => ({ req: { payload: mockPayload }, job: { id: "quota-reset-1" } });

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = { find: vi.fn(), findByID: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() };

    mockResetAllDailyCounters.mockResolvedValue(undefined);
  });

  it("should call resetAllDailyCounters and return success", async () => {
    const context = createMockContext();

    // Verify no calls before handler
    expect(mockResetAllDailyCounters).toHaveBeenCalledTimes(0);

    const result = await quotaResetJobConfig.handler(context as any);

    expect(mockResetAllDailyCounters).toHaveBeenCalled();
    expect(result.output).toEqual(
      expect.objectContaining({
        success: true,
        message: "Daily quota reset completed successfully",
        timestamp: expect.any(String),
      })
    );
  });

  it("should throw when resetAllDailyCounters fails so Payload retries", async () => {
    const dbError = new Error("Connection refused");
    mockResetAllDailyCounters.mockRejectedValue(dbError);

    const context = createMockContext();

    await expect(quotaResetJobConfig.handler(context as any)).rejects.toThrow("Connection refused");
  });
});
