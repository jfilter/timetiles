/**
 * Centralized password policy enforcement.
 *
 * Per ADR 0039: minimum 12 chars, maximum 256 chars, rejected if the
 * password appears in the Have I Been Pwned k-anonymity corpus. HIBP
 * lookups fail open (network errors / timeouts pass the check with a
 * log line) so that account recovery does not depend on a third party.
 *
 * The HIBP check can be disabled via the `PASSWORD_HIBP_CHECK` env var
 * (set to `false` to skip), which is useful for offline dev and tests.
 *
 * @module
 * @category Security
 */
import { createHash } from "node:crypto";

import { getEnv } from "@/lib/config/env";
import { createLogger } from "@/lib/logger";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type PasswordPolicyResult } from "./password-policy-constants";

export {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type PasswordPolicyFailure,
  type PasswordPolicyResult,
  validatePasswordLengthOnly,
} from "./password-policy-constants";

const logger = createLogger("password-policy");

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range";
const HIBP_TIMEOUT_MS = 3000;

/**
 * Validate a plaintext password against the centralized policy.
 *
 * Length checks are synchronous; the compromised-password check makes a
 * network request to HIBP using k-anonymity (only the first 5 chars of
 * the SHA-1 hash are sent). Network or API errors fail open.
 */
export const validatePassword = async (password: string): Promise<PasswordPolicyResult> => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, code: "too-short", message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, code: "too-long", message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` };
  }

  if (await isPasswordCompromised(password)) {
    return {
      ok: false,
      code: "compromised",
      message: "This password has appeared in a known data breach. Please choose a different one.",
    };
  }

  return { ok: true };
};

const isPasswordCompromised = async (password: string): Promise<boolean> => {
  if (!getEnv().PASSWORD_HIBP_CHECK) {
    return false;
  }

  // eslint-disable-next-line sonarjs/hashing -- HIBP's k-anonymity range API requires a SHA-1 prefix (not used for password storage)
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const response = await fetch(`${HIBP_RANGE_URL}/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "TimeTiles-PasswordPolicy/1.0" },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "HIBP non-OK response; failing open");
      return false;
    }

    const body = await response.text();
    // Lines are SHA1SUFFIX:COUNT. Padding entries use count=0.
    for (const line of body.split(/\r?\n/)) {
      const [lineSuffix, countText] = line.split(":");
      if (lineSuffix === suffix && countText && countText.trim() !== "0") {
        return true;
      }
    }
    return false;
  } catch (error) {
    logger.warn({ error: String(error) }, "HIBP lookup failed; failing open");
    return false;
  }
};
