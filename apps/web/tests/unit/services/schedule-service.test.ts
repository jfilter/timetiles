/**
 * Unit tests for schedule service.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScheduleService } from "@/lib/services/schedule-service";

describe("ScheduleService", () => {
  let mockPayload: any;
  let sigintListenersBefore: ReturnType<typeof process.listeners>;
  let sigtermListenersBefore: ReturnType<typeof process.listeners>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPayload = { jobs: { queue: vi.fn().mockResolvedValue({ id: "job-1" }) } };
    sigintListenersBefore = process.listeners("SIGINT");
    sigtermListenersBefore = process.listeners("SIGTERM");
  });

  afterEach(() => {
    for (const listener of process.listeners("SIGINT")) {
      if (!sigintListenersBefore.includes(listener)) {
        process.removeListener("SIGINT", listener);
      }
    }

    for (const listener of process.listeners("SIGTERM")) {
      if (!sigtermListenersBefore.includes(listener)) {
        process.removeListener("SIGTERM", listener);
      }
    }

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should use default config", () => {
      const service = new ScheduleService(mockPayload);
      const status = service.getStatus();
      expect(status.config.intervalMs).toBe(60000);
      expect(status.config.enabled).toBe(true);
    });

    it("should accept custom config", () => {
      const service = new ScheduleService(mockPayload, { intervalMs: 5000, enabled: false });
      const status = service.getStatus();
      expect(status.config.intervalMs).toBe(5000);
      expect(status.config.enabled).toBe(false);
    });
  });

  describe("start", () => {
    it("should not start if disabled", () => {
      const service = new ScheduleService(mockPayload, { enabled: false });
      service.start();
      const status = service.getStatus();
      expect(status.isActive).toBe(false);
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    });

    it("should resume queueing jobs after being stopped and restarted", async () => {
      const service = new ScheduleService(mockPayload, { intervalMs: 1000 });

      service.start();
      await Promise.resolve();
      await Promise.resolve();
      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);

      service.stop();
      service.start();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(2);
    });
  });

  describe("stop", () => {
    it("should be safe to call stop when not running", () => {
      const service = new ScheduleService(mockPayload);
      expect(() => service.stop()).not.toThrow();
    });

    it("should remove process signal listeners when stopped", () => {
      const service = new ScheduleService(mockPayload);

      service.start();
      expect(process.listeners("SIGINT")).toHaveLength(sigintListenersBefore.length + 1);
      expect(process.listeners("SIGTERM")).toHaveLength(sigtermListenersBefore.length + 1);

      service.stop();

      expect(process.listeners("SIGINT")).toHaveLength(sigintListenersBefore.length);
      expect(process.listeners("SIGTERM")).toHaveLength(sigtermListenersBefore.length);
    });
  });

  describe("getStatus", () => {
    it("should report inactive when not started", () => {
      const service = new ScheduleService(mockPayload);
      const status = service.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.isActive).toBe(false);
    });

    it("should report active when started", () => {
      const service = new ScheduleService(mockPayload);
      service.start();
      const status = service.getStatus();
      expect(status.isActive).toBe(true);
      service.stop();
    });
  });

  describe("triggerScheduleManager", () => {
    it("should queue a job manually", async () => {
      const service = new ScheduleService(mockPayload);
      await service.triggerScheduleManager();

      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({ task: "schedule-manager", input: {} });
    });
  });

  describe("error handling", () => {
    it("should handle queue errors gracefully", async () => {
      mockPayload.jobs.queue.mockRejectedValueOnce(new Error("Queue failed"));

      const service = new ScheduleService(mockPayload);
      // Should not throw
      await expect(service.triggerScheduleManager()).resolves.toBeUndefined();
    });
  });
});
