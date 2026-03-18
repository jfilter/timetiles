/**
 * Unit tests for URL validation SSRF protection utilities.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { isPrivateUrl } from "@/lib/security/url-validation";

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

  describe("handles edge cases", () => {
    it("returns false for unparseable URLs", () => {
      expect(isPrivateUrl("not-a-url")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isPrivateUrl("")).toBe(false);
    });
  });

  describe("ALLOW_PRIVATE_URLS bypass", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

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
