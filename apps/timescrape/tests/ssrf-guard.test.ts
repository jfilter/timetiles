/**
 * Tests for the git clone SSRF guard.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { resolvePublicGitTarget } from "../src/lib/ssrf-guard.js";

describe("resolvePublicGitTarget", () => {
  it.each(["https://[::1]/repo.git", "https://[::ffff:127.0.0.1]/repo.git", "https://[fd00::1]/repo.git"])(
    "blocks the private IPv6 literal in %s",
    async (url) => {
      await expect(resolvePublicGitTarget(url)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    }
  );

  it("blocks a private IPv4 literal", async () => {
    await expect(resolvePublicGitTarget("https://10.0.0.5/repo.git")).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("blocks a hostname that resolves to loopback", async () => {
    // localhost resolves through the hosts file, so no network is involved.
    await expect(resolvePublicGitTarget("https://localhost/r.git")).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("returns public IP literals as the vetted address without a DNS lookup", async () => {
    const v6 = new URL("https://[2606:4700:4700::1111]/repo.git");
    const v4 = new URL("https://1.1.1.1/repo.git");
    await expect(resolvePublicGitTarget(v6.href)).resolves.toEqual([v6.hostname.slice(1, -1)]);
    await expect(resolvePublicGitTarget(v4.href)).resolves.toEqual([v4.hostname]);
  });

  it("refuses a host whose DNS lookup fails instead of skipping the check", async () => {
    // .invalid never resolves (RFC 6761), online or offline.
    await expect(resolvePublicGitTarget("https://no-such-host.invalid/r.git")).rejects.toMatchObject({
      code: "GIT_CLONE_FAILED",
    });
  });
});
