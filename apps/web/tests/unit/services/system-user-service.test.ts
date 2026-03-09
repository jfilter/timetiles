/**
 * Unit tests for SystemUserService.
 *
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemUserService } from "@/lib/services/system-user-service";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe.sequential("SystemUserService", () => {
  const mockPayload = {
    findByID: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects partially numeric user ids before loading the user", async () => {
    const service = new SystemUserService(mockPayload);

    const result = await service.isSystemUser("123abc");

    expect(result).toBe(false);
    expect(mockPayload.findByID).not.toHaveBeenCalled();
  });
});
