/**
 * SSRF guard for git clone targets.
 *
 * The web side validates a repo URL by hostname pattern only. By the time the
 * runner clones, a malicious DNS record could have been rebound to point an
 * otherwise-public hostname at an internal address (the DNS-rebinding window).
 * Before cloning we re-resolve the host and reject any answer that lands in a
 * private/loopback/link-local/carrier-grade-NAT/metadata range. This is
 * defence-in-depth on top of the trust-level-3 gate and the container network
 * isolation; the clone itself runs over the host network, so the check matters.
 *
 * The IP-range classification comes from @timetiles/shared (bundled into the
 * runner at build time), so web and timescrape cannot drift apart on it.
 *
 * @module
 * @category Lib
 */

import dns from "node:dns";

import { isPrivateIP } from "@timetiles/shared";

import { RunnerError } from "./errors.js";

/**
 * Resolve a git URL's host and reject it when any answer is a private/internal
 * address. Throws a {@link RunnerError} on a blocked target. DNS-lookup failures
 * are left to surface as the normal clone transport error, so an unresolvable
 * host is not blocked here (the clone will fail anyway).
 *
 * @param gitUrl - The clone URL (without the optional `#branch` fragment).
 * @throws {RunnerError} when the host resolves to a private/internal IP, or when
 *   the URL is not a parseable http(s) URL.
 */
export const assertGitTargetIsPublic = async (gitUrl: string): Promise<void> => {
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

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    // Non-blocking: let the clone surface the transport-level failure.
    return;
  }

  for (const entry of resolved) {
    if (isPrivateIP(entry.address)) {
      throw new RunnerError(
        `Refusing to clone: host "${hostname}" resolves to private address ${entry.address}`,
        "SSRF_BLOCKED",
        400
      );
    }
  }
};
