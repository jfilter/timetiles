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
  const mockPayload = { find: vi.fn(), create: vi.fn() } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateSystemUser — concurrent creation", () => {
    // users.email is unique and auto-activation runs from onInit, so a rolling
    // deploy boots several replicas into the same create. An uncaught 23505 there
    // failed Payload's whole initialization for the losing replica.
    it("recovers from a concurrent creator instead of throwing", async () => {
      mockPayload.find
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: [{ id: 9, email: "system@timetiles.internal" }] });
      mockPayload.create.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));

      const service = new SystemUserService(mockPayload);

      await expect(service.getOrCreateSystemUser()).resolves.toEqual(
        expect.objectContaining({ id: 9, email: "system@timetiles.internal" })
      );
    });

    it("rethrows a create failure that is not a unique violation", async () => {
      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockRejectedValue(new Error("connection reset"));

      const service = new SystemUserService(mockPayload);

      await expect(service.getOrCreateSystemUser()).rejects.toThrow("connection reset");
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
  });
});
