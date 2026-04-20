/* eslint-disable sonarjs/no-hardcoded-ip -- IP addresses are intentional test values for SSRF validation */
/**
 * Unit tests for URL validation SSRF protection utilities.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as UrlValidationModule from "@/lib/security/url-validation";

const mockDnsLookup = vi.hoisted(() => vi.fn());

vi.mock("node:dns", () => ({ default: { promises: { lookup: mockDnsLookup } }, promises: { lookup: mockDnsLookup } }));

let isPrivateIP: typeof UrlValidationModule.isPrivateIP;
let isPrivateUrl: typeof UrlValidationModule.isPrivateUrl;
let validateResolvedPublicHostname: typeof UrlValidationModule.validateResolvedPublicHostname;

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("ALLOW_PRIVATE_URLS", "");
  vi.stubEnv("E2E_MODE", "");
  vi.stubEnv("NODE_ENV", "test");
  mockDnsLookup.mockReset();

  ({ isPrivateIP, isPrivateUrl, validateResolvedPublicHostname } = await import("@/lib/security/url-validation"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isPrivateUrl", () => {
  describe("blocks loopback addresses", () => {
    it("blocks 127.0.0.1", () => {
      expect(isPrivateUrl("http://127.0.0.1/data.csv")).toBe(true);
    });

    it("blocks 127.0.0.1 with port", () => {
      expect(isPrivateUrl("http://127.0.0.1:8080/data.csv")).toBe(true);
    });

    it("blocks 127.x.x.x range", () => {
      expect(isPrivateUrl("http://127.255.0.1/data.csv")).toBe(true);
    });
  });

  describe("blocks 10.x.x.x private range", () => {
    it("blocks 10.0.0.1", () => {
      expect(isPrivateUrl("http://10.0.0.1/data.csv")).toBe(true);
    });

    it("blocks 10.255.255.255", () => {
      expect(isPrivateUrl("http://10.255.255.255/data.csv")).toBe(true);
    });
  });

  describe("blocks 172.16.x.x private range", () => {
    it("blocks 172.16.0.1", () => {
      expect(isPrivateUrl("http://172.16.0.1/data.csv")).toBe(true);
    });

    it("blocks 172.31.255.255", () => {
      expect(isPrivateUrl("http://172.31.255.255/data.csv")).toBe(true);
    });

    it("allows 172.32.0.1 (outside private range)", () => {
      expect(isPrivateUrl("http://172.32.0.1/data.csv")).toBe(false);
    });

    it("allows 172.15.0.1 (outside private range)", () => {
      expect(isPrivateUrl("http://172.15.0.1/data.csv")).toBe(false);
    });
  });

  describe("blocks 192.168.x.x private range", () => {
    it("blocks 192.168.0.1", () => {
      expect(isPrivateUrl("http://192.168.0.1/data.csv")).toBe(true);
    });

    it("blocks 192.168.1.100", () => {
      expect(isPrivateUrl("http://192.168.1.100/data.csv")).toBe(true);
    });
  });

  describe("blocks 0.0.0.0", () => {
    it("blocks 0.0.0.0", () => {
      expect(isPrivateUrl("http://0.0.0.0/data.csv")).toBe(true);
    });

    it("blocks 0.x.x.x range", () => {
      expect(isPrivateUrl("http://0.1.2.3/data.csv")).toBe(true);
    });
  });

  describe("blocks link-local / cloud metadata", () => {
    it("blocks 169.254.169.254 (AWS metadata)", () => {
      expect(isPrivateUrl("http://169.254.169.254/latest/meta-data/")).toBe(true);
    });

    it("blocks 169.254.0.1", () => {
      expect(isPrivateUrl("http://169.254.0.1/data.csv")).toBe(true);
    });
  });

  describe("blocks localhost and *.local", () => {
    it("blocks localhost", () => {
      expect(isPrivateUrl("http://localhost/data.csv")).toBe(true);
    });

    it("blocks localhost with port", () => {
      expect(isPrivateUrl("http://localhost:3000/data.csv")).toBe(true);
    });

    it("blocks *.local hostnames", () => {
      expect(isPrivateUrl("http://myservice.local/data.csv")).toBe(true);
    });

    it("blocks nested .local hostnames", () => {
      expect(isPrivateUrl("http://internal.server.local/data.csv")).toBe(true);
    });
  });

  describe("blocks IPv6 private addresses", () => {
    it("blocks ::1 (loopback)", () => {
      expect(isPrivateUrl("http://[::1]/data.csv")).toBe(true);
    });

    it("blocks fe80:: (link-local)", () => {
      expect(isPrivateUrl("http://[fe80::1]/data.csv")).toBe(true);
    });

    it("blocks fc00:: (unique local)", () => {
      expect(isPrivateUrl("http://[fc00::1]/data.csv")).toBe(true);
    });

    it("blocks fd:: (unique local)", () => {
      expect(isPrivateUrl("http://[fd12::1]/data.csv")).toBe(true);
    });
  });

  describe("handles edge cases (fail-closed)", () => {
    it("returns true for unparseable URLs", () => {
      expect(isPrivateUrl("not-a-url")).toBe(true);
    });

    it("returns true for empty string", () => {
      expect(isPrivateUrl("")).toBe(true);
    });
  });

  describe("ALLOW_PRIVATE_URLS bypass", () => {
    it("allows private URLs when ALLOW_PRIVATE_URLS is set", () => {
      vi.stubEnv("ALLOW_PRIVATE_URLS", "true");
      expect(isPrivateUrl("http://127.0.0.1/data.csv")).toBe(false);
      expect(isPrivateUrl("http://localhost/data.csv")).toBe(false);
      expect(isPrivateUrl("http://10.0.0.1/data.csv")).toBe(false);
    });

    it("blocks private URLs when ALLOW_PRIVATE_URLS is not set", () => {
      vi.stubEnv("ALLOW_PRIVATE_URLS", "");
      expect(isPrivateUrl("http://127.0.0.1/data.csv")).toBe(true);
    });

    it("blocks private URLs in production even when ALLOW_PRIVATE_URLS is set", () => {
      vi.stubEnv("ALLOW_PRIVATE_URLS", "true");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("E2E_MODE", "");

      expect(isPrivateUrl("http://127.0.0.1/data.csv")).toBe(true);
    });

    it("allows private URLs for explicit E2E runtime even under production NODE_ENV", () => {
      vi.stubEnv("ALLOW_PRIVATE_URLS", "true");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("E2E_MODE", "true");

      expect(isPrivateUrl("http://127.0.0.1/data.csv")).toBe(false);
    });
  });

  describe("blocks carrier-grade NAT (RFC 6598)", () => {
    it("blocks 100.64.0.1", () => {
      vi.stubEnv("ALLOW_PRIVATE_URLS", "");
      vi.stubEnv("E2E_MODE", "");
      expect(isPrivateUrl("http://100.64.0.1/data.csv")).toBe(true);
    });

    it("blocks 100.127.255.255", () => {
      vi.stubEnv("ALLOW_PRIVATE_URLS", "");
      vi.stubEnv("E2E_MODE", "");
      expect(isPrivateUrl("http://100.127.255.255/data.csv")).toBe(true);
    });

    it("allows 100.128.0.1 (outside CGN range)", () => {
      vi.stubEnv("ALLOW_PRIVATE_URLS", "");
      vi.stubEnv("E2E_MODE", "");
      expect(isPrivateUrl("http://100.128.0.1/data.csv")).toBe(false);
    });
  });

  describe("allows public addresses", () => {
    it("allows public IPv4", () => {
      expect(isPrivateUrl("https://93.184.216.34/data.csv")).toBe(false);
    });

    it("allows public domain", () => {
      expect(isPrivateUrl("https://example.com/data.csv")).toBe(false);
    });

    it("allows public subdomain", () => {
      expect(isPrivateUrl("https://data.example.com/file.csv")).toBe(false);
    });

    it("allows HTTPS URL with port", () => {
      expect(isPrivateUrl("https://api.example.com:443/data")).toBe(false);
    });

    it("allows 8.8.8.8", () => {
      expect(isPrivateUrl("http://8.8.8.8/data.csv")).toBe(false);
    });
  });
});

describe("isPrivateIP", () => {
  it("blocks loopback 127.0.0.1", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
  });

  it("blocks 10.x range", () => {
    expect(isPrivateIP("10.0.0.1")).toBe(true);
  });

  it("blocks 172.16.x range", () => {
    expect(isPrivateIP("172.16.0.1")).toBe(true);
  });

  it("blocks 192.168.x range", () => {
    expect(isPrivateIP("192.168.1.1")).toBe(true);
  });

  it("blocks 0.0.0.0", () => {
    expect(isPrivateIP("0.0.0.0")).toBe(true);
  });

  it("blocks 169.254.169.254 (cloud metadata)", () => {
    expect(isPrivateIP("169.254.169.254")).toBe(true);
  });

  it("blocks IPv6 loopback ::1", () => {
    expect(isPrivateIP("::1")).toBe(true);
  });

  it("blocks IPv6 link-local fe80::", () => {
    expect(isPrivateIP("fe80::1")).toBe(true);
  });

  it("blocks IPv6 ULA fd00::", () => {
    expect(isPrivateIP("fd12::1")).toBe(true);
  });

  it("blocks IPv6-mapped private IPv4 addresses", () => {
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
  });

  it("allows public IP 8.8.8.8", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
  });

  it("allows public IP 93.184.216.34", () => {
    expect(isPrivateIP("93.184.216.34")).toBe(false);
  });

  it("blocks carrier-grade NAT 100.64.0.1", () => {
    expect(isPrivateIP("100.64.0.1")).toBe(true);
  });
});

describe("validateResolvedPublicHostname", () => {
  it("blocks when any resolved address is private", async () => {
    mockDnsLookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);

    await expect(validateResolvedPublicHostname("evil.example")).rejects.toThrow(
      'SSRF blocked: hostname "evil.example" resolves to private IP 127.0.0.1'
    );
    expect(mockDnsLookup).toHaveBeenCalledWith("evil.example", { all: true, verbatim: true });
  });

  it("allows when all resolved addresses are public", async () => {
    mockDnsLookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ]);

    await expect(validateResolvedPublicHostname("example.com")).resolves.toBeUndefined();
  });
});
