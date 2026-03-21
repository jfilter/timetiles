/**
 * Unit tests for SystemUserService.
 *
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemUserService } from "@/lib/account/system-user";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe.sequential("SystemUserService", () => {
  const mockPayload = { findByID: vi.fn(), find: vi.fn(), create: vi.fn() } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isSystemUser", () => {
    it("rejects partially numeric user ids before loading the user", async () => {
      const service = new SystemUserService(mockPayload);

      const result = await service.isSystemUser("123abc");

      expect(result).toBe(false);
      expect(mockPayload.findByID).not.toHaveBeenCalled();
    });

    it("returns true when user email matches system user email", async () => {
      mockPayload.findByID.mockResolvedValue({ id: 42, email: "system@timetiles.internal" });
      const service = new SystemUserService(mockPayload);

      const result = await service.isSystemUser(42);

      expect(result).toBe(true);
      expect(mockPayload.findByID).toHaveBeenCalledWith(
        expect.objectContaining({ collection: "users", id: 42, overrideAccess: true })
      );
    });

    it("returns false when user email does not match", async () => {
      mockPayload.findByID.mockResolvedValue({ id: 7, email: "regular@example.com" });
      const service = new SystemUserService(mockPayload);

      const result = await service.isSystemUser(7);

      expect(result).toBe(false);
    });

    it("returns false when user is not found", async () => {
      mockPayload.findByID.mockResolvedValue(null);
      const service = new SystemUserService(mockPayload);

      const result = await service.isSystemUser(999);

      expect(result).toBe(false);
    });

    it("uses cached system user ID on subsequent calls", async () => {
      mockPayload.findByID.mockResolvedValue({ id: 42, email: "system@timetiles.internal" });
      const service = new SystemUserService(mockPayload);

      // First call — looks up user
      await service.isSystemUser(42);
      expect(mockPayload.findByID).toHaveBeenCalledTimes(1);

      // Second call with same ID — uses cache, no DB call
      const result = await service.isSystemUser(42);
      expect(result).toBe(true);
      expect(mockPayload.findByID).toHaveBeenCalledTimes(1);
    });

    it("parses string user IDs as integers", async () => {
      mockPayload.findByID.mockResolvedValue({ id: 10, email: "system@timetiles.internal" });
      const service = new SystemUserService(mockPayload);

      const result = await service.isSystemUser("10");

      expect(result).toBe(true);
      expect(mockPayload.findByID).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
    });
  });

  describe("getOrCreateSystemUser", () => {
    it("returns existing system user when found", async () => {
      const systemUser = { id: 1, email: "system@timetiles.internal" };
      mockPayload.find.mockResolvedValue({ docs: [systemUser], totalDocs: 1 });
      const service = new SystemUserService(mockPayload);

      const result = await service.getOrCreateSystemUser();

      expect(result).toEqual(systemUser);
      expect(mockPayload.create).not.toHaveBeenCalled();
    });

    it("creates system user when none exists", async () => {
      const newUser = { id: 99, email: "system@timetiles.internal" };
      mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
      mockPayload.create.mockResolvedValue(newUser);
      const service = new SystemUserService(mockPayload);

      const result = await service.getOrCreateSystemUser();

      expect(result).toEqual(newUser);
      expect(mockPayload.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "users",
          overrideAccess: true,
          data: expect.objectContaining({ email: "system@timetiles.internal", isActive: false }),
        })
      );
    });

    it("uses cached ID on subsequent calls", async () => {
      const systemUser = { id: 1, email: "system@timetiles.internal" };
      mockPayload.find.mockResolvedValue({ docs: [systemUser], totalDocs: 1 });
      mockPayload.findByID.mockResolvedValue(systemUser);
      const service = new SystemUserService(mockPayload);

      // First call — searches via find()
      await service.getOrCreateSystemUser();
      expect(mockPayload.find).toHaveBeenCalledTimes(1);

      // Second call — uses cached ID via findByID()
      const result = await service.getOrCreateSystemUser();
      expect(result).toEqual(systemUser);
      expect(mockPayload.find).toHaveBeenCalledTimes(1); // Not called again
      expect(mockPayload.findByID).toHaveBeenCalledTimes(1);
    });
  });
});
