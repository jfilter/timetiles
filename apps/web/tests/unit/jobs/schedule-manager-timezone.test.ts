/**
 * Unit tests for timezone-aware schedule management.
 *
 * Tests that the schedule manager correctly interprets cron expressions
 * and frequency schedules in the user's timezone rather than UTC.
 *
 * @module
 * @category Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleManagerJob } from "@/lib/jobs/handlers/schedule-manager-job";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  logError: vi.fn(),
}));

vi.mock("@/lib/services/feature-flag-service", () => ({ isFeatureEnabled: vi.fn().mockResolvedValue(true) }));

describe.sequential("scheduleManagerJob timezone support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createMockContext = () => {
    const mockPayload = {
      find: vi.fn(),
      findByID: vi.fn(),
      // triggerScheduledImport uses conditional WHERE update that expects { docs: [...] }
      update: vi.fn().mockResolvedValue({ docs: [{ id: "claimed" }] }),
      jobs: { queue: vi.fn().mockResolvedValue({ id: "url-fetch-job-tz" }) },
    };
    const mockJob = { id: "schedule-job-tz" };
    const mockReq = { payload: mockPayload as any };
    return { mockPayload, mockJob, mockReq };
  };

  describe("cron with timezone", () => {
    it("should trigger cron at correct time when timezone is Europe/Berlin", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      // Cron: "0 8 * * *" means 08:00 in Europe/Berlin
      // In winter (CET = UTC+1), 08:00 Berlin = 07:00 UTC
      // Set current time to 2024-01-15 07:05 UTC (= 08:05 Berlin)
      const currentTime = new Date("2024-01-15T07:05:00Z");
      vi.setSystemTime(currentTime);

      const mockImport: any = {
        id: "tz-cron-import",
        name: "Berlin Cron Import",
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        scheduleType: "cron",
        cronExpression: "0 8 * * *", // 08:00 in Berlin timezone
        timezone: "Europe/Berlin",
        lastRun: new Date("2024-01-14T07:00:00Z").toISOString(), // Yesterday 08:00 Berlin
        catalog: "catalog-1",
        createdBy: "user-1",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);
      expect(result.output.triggered).toBe(1);
    });

    it("should NOT trigger cron if UTC time matches but timezone time does not", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      // Cron: "0 8 * * *" means 08:00 in America/New_York
      // In winter (EST = UTC-5), 08:00 New York = 13:00 UTC
      // Set current time to 2024-01-15 08:05 UTC (= 03:05 New York - too early!)
      const currentTime = new Date("2024-01-15T08:05:00Z");
      vi.setSystemTime(currentTime);

      const mockImport: any = {
        id: "tz-cron-ny",
        name: "New York Cron Import",
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        scheduleType: "cron",
        cronExpression: "0 8 * * *",
        timezone: "America/New_York",
        lastRun: new Date("2024-01-14T13:00:00Z").toISOString(), // Yesterday 08:00 NY
        catalog: "catalog-1",
        createdBy: "user-1",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
      expect(result.output.triggered).toBe(0);
    });

    it("should calculate next cron run in user timezone", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      // Cron: "0 8 * * *" means 08:00 in Europe/Berlin
      // Current time: 2024-01-15 07:05 UTC (= 08:05 Berlin)
      // Next run should be 2024-01-16 07:00 UTC (= 08:00 Berlin tomorrow)
      const currentTime = new Date("2024-01-15T07:05:00Z");
      vi.setSystemTime(currentTime);

      const mockImport: any = {
        id: "tz-cron-next",
        name: "Berlin Next Run",
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        scheduleType: "cron",
        cronExpression: "0 8 * * *",
        timezone: "Europe/Berlin",
        lastRun: new Date("2024-01-14T07:00:00Z").toISOString(),
        catalog: "catalog-1",
        createdBy: "user-1",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Check that nextRun was set to 08:00 Berlin = 07:00 UTC on 2024-01-16
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextRun: "2024-01-16T07:00:00.000Z" }) })
      );
    });
  });

  describe("frequency with timezone", () => {
    it("should calculate daily next run at midnight in user timezone", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      // Current time: 2024-01-16 00:30 UTC (= 01:30 Berlin CET, past midnight)
      // nextRun was set to midnight Berlin = 2024-01-15 23:00 UTC
      // currentTime > nextRun -> should trigger
      const currentTime = new Date("2024-01-16T00:30:00Z");
      vi.setSystemTime(currentTime);

      const mockImport: any = {
        id: "tz-daily",
        name: "Berlin Daily Import",
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        scheduleType: "frequency",
        frequency: "daily",
        timezone: "Europe/Berlin",
        nextRun: new Date("2024-01-15T23:00:00Z").toISOString(), // midnight Berlin Jan 16
        lastRun: new Date("2024-01-14T23:00:00Z").toISOString(),
        catalog: "catalog-1",
        createdBy: "user-1",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should be triggered (past midnight Berlin)
      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);

      // Next run should be midnight Berlin Jan 17 = 2024-01-16 23:00 UTC
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextRun: "2024-01-16T23:00:00.000Z" }) })
      );
    });

    it("should calculate hourly next run at top-of-hour in user timezone", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      // Current time: 2024-01-15 11:30 UTC (= 06:30 EST New York)
      // nextRun: 2024-01-15 11:00 UTC (= 06:00 EST) — already past
      // Next hourly: 07:00 EST = 2024-01-15 12:00 UTC
      const currentTime = new Date("2024-01-15T11:30:00Z");
      vi.setSystemTime(currentTime);

      const mockImport: any = {
        id: "tz-hourly",
        name: "NY Hourly Import",
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        scheduleType: "frequency",
        frequency: "hourly",
        timezone: "America/New_York",
        nextRun: new Date("2024-01-15T11:00:00Z").toISOString(), // 06:00 EST
        lastRun: new Date("2024-01-15T10:00:00Z").toISOString(),
        catalog: "catalog-1",
        createdBy: "user-1",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should be triggered
      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);

      // Hourly: next top-of-hour in NY timezone
      // 06:30 EST -> next full hour is 07:00 EST = 12:00 UTC
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextRun: "2024-01-15T12:00:00.000Z" }) })
      );
    });
  });

  describe("backward compatibility", () => {
    it("should default to UTC when no timezone is set", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15T10:30:00Z");
      vi.setSystemTime(currentTime);

      const mockImport: any = {
        id: "no-tz-import",
        name: "No TZ Import",
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        scheduleType: "frequency",
        frequency: "hourly",
        // No timezone field
        lastRun: new Date("2024-01-15T09:00:00Z").toISOString(),
        catalog: "catalog-1",
        createdBy: "user-1",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should trigger (UTC behavior unchanged)
      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);

      // Next run should be 11:00 UTC (next hour boundary in UTC)
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextRun: "2024-01-15T11:00:00.000Z" }) })
      );
    });

    it("should handle timezone: null as UTC", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15T00:30:00Z");
      vi.setSystemTime(currentTime);

      const mockImport: any = {
        id: "null-tz-import",
        name: "Null TZ Import",
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        scheduleType: "frequency",
        frequency: "daily",
        timezone: null,
        lastRun: new Date("2024-01-14T00:00:00Z").toISOString(),
        catalog: "catalog-1",
        createdBy: "user-1",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should trigger (past midnight UTC)
      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);
    });
  });

  describe("DST transitions", () => {
    it("should handle winter-to-summer DST transition (Europe/Berlin)", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      // Berlin DST: clocks spring forward on last Sunday of March at 02:00 -> 03:00
      // 2024-03-31 is a Sunday (DST transition day)
      // Before DST: CET (UTC+1), After DST: CEST (UTC+2)
      //
      // A cron at "0 8 * * *" (08:00 Berlin):
      // - On 2024-03-30 (before DST): 08:00 CET = 07:00 UTC
      // - On 2024-03-31 (after DST): 08:00 CEST = 06:00 UTC
      const currentTime = new Date("2024-03-31T06:05:00Z");
      vi.setSystemTime(currentTime);

      const mockImport: any = {
        id: "dst-import",
        name: "DST Import",
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        scheduleType: "cron",
        cronExpression: "0 8 * * *",
        timezone: "Europe/Berlin",
        lastRun: new Date("2024-03-30T07:00:00Z").toISOString(), // Yesterday 08:00 CET
        catalog: "catalog-1",
        createdBy: "user-1",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should trigger: 06:05 UTC = 08:05 CEST (after DST, past the 08:00 mark)
      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);
      expect(result.output.triggered).toBe(1);

      // Next run should be 2024-04-01 06:00 UTC (= 08:00 CEST)
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextRun: "2024-04-01T06:00:00.000Z" }) })
      );
    });
  });
});
