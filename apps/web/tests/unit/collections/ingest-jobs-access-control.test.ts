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

  // Update is restricted to editors/admins (isEditorOrAdmin). Owners deliberately
  // do NOT get generic REST update access: the pipeline fields (stage,
  // schemaValidation.approved, dataset, duplicates.summary, ...) have no
  // field-level write guard, so a forged owner PATCH could force-approve an
  // import (bypassing the quota check) or reassign the dataset. Every legitimate
  // owner mutation goes through /approve, /reset, /retry (Local API +
  // overrideAccess). See lib/collections/ingest-jobs/access-control.ts.
  describe("update", () => {
    it("should allow editors and admins", async () => {
      mocks.isEditorOrAdmin.mockReturnValue(true);
      const req = { user: { id: 1, role: "admin" }, payload: {} };

      const result = await ingestJobsAccess.update({ req, id: 1 } as any);

      expect(result).toBe(true);
    });

    it("should deny a non-privileged user even when they own the linked ingest file", async () => {
      mocks.isEditorOrAdmin.mockReturnValue(false);
      const req = { user: { id: 42, role: "user" }, payload: {} };

      const result = await ingestJobsAccess.update({ req, id: 1 } as any);

      expect(result).toBe(false);
    });

    it("should deny anonymous requests", async () => {
      mocks.isEditorOrAdmin.mockReturnValue(false);
      const req = { user: null, payload: {} };

      const result = await ingestJobsAccess.update({ req, id: undefined } as any);

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
      const req = { user: { id: 42, role: "user" }, payload: {} };

      const result = await ingestJobsAccess.read({ req } as any);

      expect(result).toEqual({ "ingestFile.user": { equals: 42 } });
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
