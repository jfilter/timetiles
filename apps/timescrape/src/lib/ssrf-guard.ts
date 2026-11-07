/**
 * SSRF guard for git clone targets.
 *
 * The web side validates a repo URL by hostname pattern only. By the time the
 * runner clones, a malicious DNS record could have been rebound to point an
 * otherwise-public hostname at an internal address (the DNS-rebinding window).
 * Before cloning we re-resolve the host and reject any answer that lands in a
 * private/loopback/link-local/carrier-grade-NAT/metadata range. The vetted
 * addresses are returned so the clone can be pinned to them (see
 * git-egress-proxy.ts); the clone itself runs over the host network.
 *
 * The IP-range classification comes from @timetiles/shared, so web and
 * timescrape cannot drift apart on it.
 *
 * @module
 * @category Lib
 */

import dns from "node:dns";
import { isIP } from "node:net";

import { isPrivateIP } from "@timetiles/shared";

import { RunnerError } from "./errors.js";

/**
 * Resolve a git URL's host and reject it when any answer is a private/internal
 * address. A failed DNS lookup is refused too, so an unchecked host is never cloned.
 *
 * @param gitUrl - The clone URL (without the optional `#branch` fragment).
 * @returns The vetted addresses, in resolver order; the only ones the clone may connect to.
 * @throws {RunnerError} when the host resolves to a private/internal IP, cannot be
 *   resolved, or the URL is not a parseable http(s) URL.
 */
export const resolvePublicGitTarget = async (gitUrl: string): Promise<string[]> => {
  let parsed: URL;
  try {
    parsed = new URL(gitUrl);
  } catch {
    throw new RunnerError("Invalid code_url", "INVALID_REQUEST", 400);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new RunnerError("Only HTTP(S) git URLs are allowed", "INVALID_REQUEST", 400);
  }

  const hostname = parsed.hostname;

  // URL keeps IPv6 literals bracketed, which DNS answers with ENOTFOUND; classify literals directly.
  const literal = hostname.replace(/^\[(.*)\]$/, "$1");
  if (isIP(literal) !== 0) {
    assertAddressIsPublic(hostname, literal);
    return [literal];
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await dns.promises.lookup(hostname, { all: true, order: "verbatim" });
  } catch (error) {
    // Fail closed: a host this process cannot resolve is a host the check never inspected.
    const reason = error instanceof Error ? error.message : String(error);
    throw new RunnerError(`Cannot resolve git host "${hostname}": ${reason}`, "GIT_CLONE_FAILED", 500);
  }

  for (const entry of resolved) {
    assertAddressIsPublic(hostname, entry.address);
  }
  return resolved.map((entry) => entry.address);
};

const assertAddressIsPublic = (hostname: string, address: string): void => {
  if (isPrivateIP(address)) {
    throw new RunnerError(
      `Refusing to clone: host "${hostname}" resolves to private address ${address}`,
      "SSRF_BLOCKED",
      400
    );
  }
};
