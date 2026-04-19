/* eslint-disable sonarjs/no-hardcoded-ip -- IP addresses are intentional test values for SSRF validation */
/**
 * Unit tests for SSRF-safe fetch wrapper.
 *
 * @module
 * @category Tests
 */
import dns from "node:dns";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "@/lib/config/env";
import { safeFetch } from "@/lib/security/safe-fetch";

// Mock dns.promises.lookup
vi.mock("node:dns", () => ({ default: { promises: { lookup: vi.fn() } }, promises: { lookup: vi.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- referenced inside describe blocks
const mockDnsLookup = dns.promises.lookup as unknown as ReturnType<typeof vi.fn>;

/** Helper to create a mock Response with proper headers. */
const createResponse = (status: number, headers?: Record<string, string>): Response =>
  new Response(null, { status, headers: headers ? new Headers(headers) : undefined });

describe.sequential("safeFetch", () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    (dns.promises.lookup as ReturnType<typeof vi.fn>).mockReset();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_MODE", "");
    vi.stubEnv("ALLOW_PRIVATE_URLS", "");
    resetEnv();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    resetEnv();
  });

  describe("blocks private URLs", () => {
    it("rejects fetch to 127.0.0.1", async () => {
      await expect(safeFetch("http://127.0.0.1/data")).rejects.toThrow("SSRF blocked");
    });

    it("rejects fetch to localhost", async () => {
      await expect(safeFetch("http://localhost:3000/api")).rejects.toThrow("SSRF blocked");
    });

    it("rejects fetch to 169.254.169.254 (cloud metadata)", async () => {
      await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow("SSRF blocked");
    });

    it("rejects fetch to 10.x private range", async () => {
      await expect(safeFetch("http://10.0.0.1/internal")).rejects.toThrow("SSRF blocked");
    });

    it("rejects fetch to 192.168.x.x", async () => {
      await expect(safeFetch("http://192.168.1.1/admin")).rejects.toThrow("SSRF blocked");
    });
  });

  describe("allows public URLs", () => {
    it("fetches public URLs successfully", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200));
      const response = await safeFetch("https://example.com/data.csv");
      expect(response.status).toBe(200);
    });

    it("sets redirect: manual on all requests", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200));
      await safeFetch("https://example.com/data.csv", { method: "GET", headers: { Authorization: "Bearer token" } });
      const callArgs = mockFetch.mock.calls[0] as unknown[];
      expect(callArgs?.[1]).toMatchObject({ redirect: "manual" });
    });
  });

  describe("redirect validation", () => {
    it("follows safe redirects", async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse(301, { location: "https://cdn.example.com/data.csv" }))
        .mockResolvedValueOnce(createResponse(200));

      const response = await safeFetch("https://example.com/data.csv");
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("blocks redirect to private IP", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(302, { location: "http://169.254.169.254/latest/meta-data/" }));

      await expect(safeFetch("https://attacker.com/redirect")).rejects.toThrow("SSRF blocked");
    });

    it("blocks redirect to localhost", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(301, { location: "http://localhost:8080/internal" }));

      await expect(safeFetch("https://public.com/redirect")).rejects.toThrow("SSRF blocked");
    });

    it("limits redirect count", async () => {
      for (let i = 0; i < 7; i++) {
        mockFetch.mockResolvedValueOnce(createResponse(301, { location: `https://example.com/hop${i + 1}` }));
      }

      await expect(safeFetch("https://example.com/start")).rejects.toThrow("too many redirects");
    });

    it("respects custom maxRedirects", async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse(301, { location: "https://example.com/hop1" }))
        .mockResolvedValueOnce(createResponse(301, { location: "https://example.com/hop2" }))
        .mockResolvedValueOnce(createResponse(301, { location: "https://example.com/hop3" }));

      await expect(safeFetch("https://example.com/start", { maxRedirects: 1 })).rejects.toThrow("too many redirects");
    });

    it("detects redirect loops", async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse(301, { location: "https://example.com/b" }))
        .mockResolvedValueOnce(createResponse(301, { location: "https://example.com/a" }));

      await expect(safeFetch("https://example.com/a")).rejects.toThrow("redirect loop");
    });

    it("handles redirect without Location header", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(301));

      const response = await safeFetch("https://example.com/no-location");
      expect(response.status).toBe(301);
    });

    it("resolves relative redirects correctly", async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse(301, { location: "/new-path/data.csv" }))
        .mockResolvedValueOnce(createResponse(200));

      const response = await safeFetch("https://example.com/old-path/data.csv");
      expect(response.status).toBe(200);
      // Second call should resolve to absolute URL
      expect(mockFetch.mock.calls[1]?.[0]).toBe("https://example.com/new-path/data.csv");
    });
  });

  describe("DNS resolution check", () => {
    const dnsLookup = dns.promises.lookup as ReturnType<typeof vi.fn>;

    it("blocks when DNS resolves to private IP", async () => {
      dnsLookup.mockResolvedValueOnce({ address: "127.0.0.1", family: 4 });

      await expect(safeFetch("https://evil.com/data.csv", { dnsCheck: true })).rejects.toThrow(
        'SSRF blocked: hostname "evil.com" resolves to private IP 127.0.0.1'
      );
    });

    it("blocks DNS rebinding to cloud metadata IP", async () => {
      dnsLookup.mockResolvedValueOnce({ address: "169.254.169.254", family: 4 });

      await expect(safeFetch("https://attacker.com/data", { dnsCheck: true })).rejects.toThrow("SSRF blocked");
    });

    it("allows when DNS resolves to public IP", async () => {
      dnsLookup.mockResolvedValueOnce({ address: "93.184.216.34", family: 4 });
      mockFetch.mockResolvedValueOnce(createResponse(200));

      const response = await safeFetch("https://example.com/data.csv", { dnsCheck: true });
      expect(response.status).toBe(200);
    });

    it("does not block when DNS lookup fails (non-SSRF error)", async () => {
      dnsLookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
      mockFetch.mockResolvedValueOnce(createResponse(200));

      const response = await safeFetch("https://example.com/data.csv", { dnsCheck: true });
      expect(response.status).toBe(200);
    });

    it("skips DNS check when not enabled", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200));

      const response = await safeFetch("https://example.com/data.csv");
      expect(response.status).toBe(200);
      expect(dnsLookup).not.toHaveBeenCalled();
    });

    it("blocks DNS rebinding on redirect target", async () => {
      dnsLookup
        .mockResolvedValueOnce({ address: "93.184.216.34", family: 4 }) // initial URL OK
        .mockResolvedValueOnce({ address: "127.0.0.1", family: 4 }); // redirect target is private
      mockFetch.mockResolvedValueOnce(createResponse(301, { location: "https://rebind.example.com/data" }));

      await expect(safeFetch("https://public.com/data", { dnsCheck: true })).rejects.toThrow("SSRF blocked");
    });
  });

  describe("production DNS enforcement", () => {
    const dnsLookup = dns.promises.lookup as ReturnType<typeof vi.fn>;

    it("enforces DNS resolution checks in production even when SSRF_DNS_CHECK is false", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SSRF_DNS_CHECK", "false");
      resetEnv();
      dnsLookup.mockResolvedValueOnce({ address: "127.0.0.1", family: 4 });

      await expect(safeFetch("https://evil.com/data.csv")).rejects.toThrow(
        'SSRF blocked: hostname "evil.com" resolves to private IP 127.0.0.1'
      );
    });

    it("does not allow dnsCheck=false to disable production DNS enforcement", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SSRF_DNS_CHECK", "false");
      resetEnv();
      dnsLookup.mockResolvedValueOnce({ address: "169.254.169.254", family: 4 });

      await expect(safeFetch("https://metadata.example/data.csv", { dnsCheck: false })).rejects.toThrow("SSRF blocked");
    });
  });

  describe("scheme validation", () => {
    it("blocks file:// URLs", async () => {
      await expect(safeFetch("file:///etc/passwd")).rejects.toThrow("unsupported protocol");
    });

    it("blocks data: URLs", async () => {
      await expect(safeFetch("data:text/html,<h1>hi</h1>")).rejects.toThrow("unsupported protocol");
    });

    it("blocks redirect to file:// URL", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(301, { location: "file:///etc/passwd" }));

      await expect(safeFetch("https://attacker.com/redirect")).rejects.toThrow("unsupported protocol");
    });
  });
});
