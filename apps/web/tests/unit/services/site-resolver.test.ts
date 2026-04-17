/**
 * Unit tests for site resolver functions.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSiteCache,
  findDefaultSite,
  findSiteByDomain,
  resolveSite,
} from "@/lib/services/resolution/site-resolver";

/**
 * Creates a fresh mock Payload instance with a `find` method.
 * Defined locally to avoid any cross-test interference from shared vi.fn() tracking.
 */
const createPayloadMock = () => ({ find: vi.fn() });

describe.sequential("site-resolver", () => {
  beforeEach(() => {
    clearSiteCache();
  });

  describe("clearSiteCache", () => {
    it("clears cached domain lookups so the next request re-queries Payload", async () => {
      const payload = createPayloadMock();
      payload.find.mockResolvedValue({ docs: [] });

      await findSiteByDomain(payload as any, "clear-cache.example.com");
      clearSiteCache();
      await findSiteByDomain(payload as any, "clear-cache.example.com");

      expect(payload.find).toHaveBeenCalledTimes(2);
    });

    it("remains idempotent across repeated clears", async () => {
      const payload = createPayloadMock();
      payload.find.mockResolvedValue({ docs: [] });

      await findSiteByDomain(payload as any, "repeat-clear.example.com");
      clearSiteCache();
      clearSiteCache();
      await findSiteByDomain(payload as any, "repeat-clear.example.com");

      expect(payload.find).toHaveBeenCalledTimes(2);
    });
  });

  describe("findSiteByDomain", () => {
    it("should return null when no matching domain is found", async () => {
      const payload = createPayloadMock();
      payload.find.mockResolvedValueOnce({ docs: [] });

      const result = await findSiteByDomain(payload as any, "no-match.example.com");

      expect(result).toBeNull();
      expect(payload.find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "sites",
          where: { domain: { equals: "no-match.example.com" }, _status: { equals: "published" } },
        })
      );
    });

    it("should return the site when a matching domain is found", async () => {
      const payload = createPayloadMock();
      const mockSite = { id: 1, name: "Test Site", domain: "events.city.gov" };
      payload.find.mockResolvedValueOnce({ docs: [mockSite] });

      const result = await findSiteByDomain(payload as any, "found.example.com");

      expect(result).toEqual(mockSite);
    });

    it("should return null when payload.find throws an error", async () => {
      const payload = createPayloadMock();
      payload.find.mockRejectedValueOnce(new Error("DB connection failed"));

      const result = await findSiteByDomain(payload as any, "error.example.com");

      expect(result).toBeNull();
    });

    it("should cache results and not query again for the same domain", async () => {
      const payload = createPayloadMock();
      payload.find.mockResolvedValueOnce({ docs: [] });

      await findSiteByDomain(payload as any, "cache-test.example.com");
      const secondResult = await findSiteByDomain(payload as any, "cache-test.example.com");

      expect(secondResult).toBeNull();
      expect(payload.find).toHaveBeenCalledTimes(1);
    });
  });

  describe("findDefaultSite", () => {
    it("should return null when no default site exists", async () => {
      const payload = createPayloadMock();
      payload.find.mockResolvedValueOnce({ docs: [] });

      const result = await findDefaultSite(payload as any);

      expect(result).toBeNull();
      expect(payload.find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "sites",
          where: { isDefault: { equals: true }, _status: { equals: "published" } },
        })
      );
    });

    it("should return the default site when one exists", async () => {
      const payload = createPayloadMock();
      const mockSite = { id: 1, name: "Default Site", isDefault: true };
      payload.find.mockResolvedValueOnce({ docs: [mockSite] });

      const result = await findDefaultSite(payload as any);

      expect(result).toEqual(mockSite);
    });

    it("should return null when payload.find throws an error", async () => {
      const payload = createPayloadMock();
      payload.find.mockRejectedValueOnce(new Error("DB connection failed"));

      const result = await findDefaultSite(payload as any);

      expect(result).toBeNull();
    });

    it("should cache results and not query again on subsequent calls", async () => {
      const payload = createPayloadMock();
      payload.find.mockResolvedValueOnce({ docs: [] });

      await findDefaultSite(payload as any);
      const secondResult = await findDefaultSite(payload as any);

      expect(secondResult).toBeNull();
      expect(payload.find).toHaveBeenCalledTimes(1);
    });
  });

  describe("resolveSite", () => {
    it("should skip domain lookup for localhost", async () => {
      const payload = createPayloadMock();
      const mockDefault = { id: 1, name: "Default", isDefault: true };
      payload.find.mockResolvedValueOnce({ docs: [mockDefault] });

      const result = await resolveSite(payload as any, "localhost");

      expect(result).toEqual(mockDefault);
      expect(payload.find).toHaveBeenCalledTimes(1);
      expect(payload.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isDefault: { equals: true } }) })
      );
    });

    it("should skip domain lookup for 127.0.0.1", async () => {
      const payload = createPayloadMock();
      const mockDefault = { id: 1, name: "Default", isDefault: true };
      payload.find.mockResolvedValueOnce({ docs: [mockDefault] });

      const result = await resolveSite(payload as any, "127.0.0.1");

      expect(result).toEqual(mockDefault);
      expect(payload.find).toHaveBeenCalledTimes(1);
      expect(payload.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isDefault: { equals: true } }) })
      );
    });

    it("should skip domain lookup for localhost with port", async () => {
      const payload = createPayloadMock();
      payload.find.mockResolvedValueOnce({ docs: [] });

      const result = await resolveSite(payload as any, "localhost:3000");

      expect(payload.find).toHaveBeenCalledTimes(1);
      expect(payload.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isDefault: { equals: true } }) })
      );
      expect(result).toBeNull();
    });

    it("should return null when host is null and no default site exists", async () => {
      const payload = createPayloadMock();
      payload.find.mockResolvedValueOnce({ docs: [] });

      const result = await resolveSite(payload as any, null);

      expect(result).toBeNull();
    });

    it("should return null when host is undefined and no default site exists", async () => {
      const payload = createPayloadMock();
      payload.find.mockResolvedValueOnce({ docs: [] });

      const result = await resolveSite(payload as any);

      expect(result).toBeNull();
    });

    it("should try domain match first for non-localhost hosts", async () => {
      const payload = createPayloadMock();
      const mockSite = { id: 1, name: "Domain Site", domain: "domain-first.example.com" };
      payload.find.mockResolvedValueOnce({ docs: [mockSite] });

      const result = await resolveSite(payload as any, "domain-first.example.com");

      expect(result).toEqual(mockSite);
      expect(payload.find).toHaveBeenCalledTimes(1);
    });

    it("should strip port from host before domain lookup", async () => {
      const payload = createPayloadMock();
      const mockSite = { id: 1, name: "Domain Site", domain: "port-strip.example.com" };
      payload.find.mockResolvedValueOnce({ docs: [mockSite] });

      const result = await resolveSite(payload as any, "port-strip.example.com:8080");

      expect(result).toEqual(mockSite);
      expect(payload.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ domain: { equals: "port-strip.example.com" } }) })
      );
    });

    it("should fall back to default site when domain match fails", async () => {
      const payload = createPayloadMock();
      const mockDefault = { id: 2, name: "Default Site", isDefault: true };
      // First call: domain lookup returns empty
      payload.find.mockResolvedValueOnce({ docs: [] });
      // Second call: default site lookup
      payload.find.mockResolvedValueOnce({ docs: [mockDefault] });

      const result = await resolveSite(payload as any, "fallback.example.com");

      expect(result).toEqual(mockDefault);
      expect(payload.find).toHaveBeenCalledTimes(2);
    });

    it("should return null when neither domain nor default site is found", async () => {
      const payload = createPayloadMock();
      // Domain lookup returns empty
      payload.find.mockResolvedValueOnce({ docs: [] });
      // Default site lookup returns empty
      payload.find.mockResolvedValueOnce({ docs: [] });

      const result = await resolveSite(payload as any, "nothing.example.com");

      expect(result).toBeNull();
    });
  });
});
