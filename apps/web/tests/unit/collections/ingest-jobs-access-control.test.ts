/**
 * Unit tests for ingest-jobs access control.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  isPrivileged: vi.fn(() => false),
  isEditorOrAdmin: vi.fn(() => false),
  mockIsEnabled: vi.fn(),
  extractRelationId: vi.fn((v: any) => (typeof v === "object" && v !== null ? v?.id : v)),
  requireRelationId: vi.fn((v: any) => {
    const id = typeof v === "object" && v !== null ? v?.id : v;
    if (!id) throw new Error("Missing relation ID");
    return id;
  }),
}));

vi.mock("@/lib/collections/shared-fields", () => ({
  isPrivileged: mocks.isPrivileged,
  isEditorOrAdmin: mocks.isEditorOrAdmin,
}));

vi.mock("@/lib/services/feature-flag-service", () => ({
  getFeatureFlagService: vi.fn().mockReturnValue({ isEnabled: mocks.mockIsEnabled }),
}));

vi.mock("@/lib/utils/relation-id", () => ({
  extractRelationId: mocks.extractRelationId,
  requireRelationId: mocks.requireRelationId,
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ingestJobsAccess } from "@/lib/collections/ingest-jobs/access-control";

describe.sequential("ingestJobsAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPrivileged.mockReturnValue(false);
    mocks.isEditorOrAdmin.mockReturnValue(false);
    mocks.extractRelationId.mockImplementation((v: any) => (typeof v === "object" && v !== null ? v?.id : v));
    mocks.requireRelationId.mockImplementation((v: any) => {
      const id = typeof v === "object" && v !== null ? v?.id : v;
      if (!id) throw new Error("Missing relation ID");
      return id;
    });
  });

  describe("update", () => {
    it("should allow privileged users", async () => {
      mocks.isPrivileged.mockReturnValue(true);
      const req = { user: { id: 1, role: "admin" }, payload: {} };

      const result = await ingestJobsAccess.update({ req, id: 1 } as any);

      expect(result).toBe(true);
    });

    it("should allow owner of ingest file linked to the job", async () => {
      const mockFindByID = vi
        .fn()
        .mockResolvedValueOnce({ ingestFile: { id: 10 } }) // findByID for ingest-job
        .mockResolvedValueOnce({ user: { id: 42 } }); // findByID for ingest-file
      const req = { user: { id: 42, role: "user" }, payload: { findByID: mockFindByID } };

      const result = await ingestJobsAccess.update({ req, id: 1 } as any);

      expect(result).toBe(true);
    });

    it("should deny when job has no ingestFile", async () => {
      const mockFindByID = vi.fn().mockResolvedValueOnce({ ingestFile: null });
      const req = { user: { id: 42, role: "user" }, payload: { findByID: mockFindByID } };

      const result = await ingestJobsAccess.update({ req, id: 1 } as any);

      expect(result).toBe(false);
    });

    it("should deny when ingest file has no user", async () => {
      const mockFindByID = vi
        .fn()
        .mockResolvedValueOnce({ ingestFile: { id: 10 } })
        .mockResolvedValueOnce({ user: null });
      const req = { user: { id: 42, role: "user" }, payload: { findByID: mockFindByID } };

      const result = await ingestJobsAccess.update({ req, id: 1 } as any);

      expect(result).toBe(false);
    });

    it("should deny when findByID throws", async () => {
      const mockFindByID = vi.fn().mockRejectedValueOnce(new Error("DB error"));
      const req = { user: { id: 42, role: "user" }, payload: { findByID: mockFindByID } };

      const result = await ingestJobsAccess.update({ req, id: 1 } as any);

      expect(result).toBe(false);
    });

    it("should deny when no user and no id", async () => {
      const req = { user: null, payload: {} };

      const result = await ingestJobsAccess.update({ req, id: undefined } as any);

      expect(result).toBe(false);
    });

    it("should deny when user exists but id is missing", async () => {
      const req = { user: { id: 42, role: "user" }, payload: {} };

      const result = await ingestJobsAccess.update({ req, id: undefined } as any);

      expect(result).toBe(false);
    });

    it("should deny when user does not own the ingest file", async () => {
      const mockFindByID = vi
        .fn()
        .mockResolvedValueOnce({ ingestFile: { id: 10 } })
        .mockResolvedValueOnce({ user: { id: 99 } });
      const req = { user: { id: 42, role: "user" }, payload: { findByID: mockFindByID } };

      const result = await ingestJobsAccess.update({ req, id: 1 } as any);

      expect(result).toBe(false);
    });
  });

  describe("read", () => {
    it("should allow privileged users", async () => {
      mocks.isPrivileged.mockReturnValue(true);
      const req = { user: { id: 1, role: "admin" }, payload: {} };

      const result = await ingestJobsAccess.read({ req } as any);

      expect(result).toBe(true);
    });

    it("should deny when no user", async () => {
      const req = { user: null, payload: {} };

      const result = await ingestJobsAccess.read({ req } as any);

      expect(result).toBe(false);
    });

    it("should return WHERE constraint for user with ingest files", async () => {
      const mockFind = vi.fn().mockResolvedValue({ docs: [{ id: 10 }, { id: 20 }] });
      const req = { user: { id: 42, role: "user" }, payload: { find: mockFind } };

      const result = await ingestJobsAccess.read({ req } as any);

      expect(result).toEqual({ ingestFile: { in: [10, 20] } });
    });

    it("should deny when user has no ingest files", async () => {
      const mockFind = vi.fn().mockResolvedValue({ docs: [] });
      const req = { user: { id: 42, role: "user" }, payload: { find: mockFind } };

      const result = await ingestJobsAccess.read({ req } as any);

      expect(result).toBe(false);
    });
  });

  describe("create", () => {
    it("should deny when no user", async () => {
      const req = { user: null, payload: {} };

      const result = await ingestJobsAccess.create({ req } as any);

      expect(result).toBe(false);
    });

    it("should allow when feature is enabled", async () => {
      mocks.mockIsEnabled.mockResolvedValue(true);
      const req = { user: { id: 1, role: "user" }, payload: {} };

      const result = await ingestJobsAccess.create({ req } as any);

      expect(result).toBe(true);
    });

    it("should deny when feature is disabled", async () => {
      mocks.mockIsEnabled.mockResolvedValue(false);
      const req = { user: { id: 1, role: "user" }, payload: {} };

      const result = await ingestJobsAccess.create({ req } as any);

      expect(result).toBe(false);
    });
  });
});
