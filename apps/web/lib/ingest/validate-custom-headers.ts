/**
 * Validator for user-supplied custom HTTP headers on scheduled ingests.
 *
 * Scheduled-ingest `authConfig.customHeaders` flows from user input straight
 * into outbound request headers via `buildAuthHeaders`. undici rejects CRLF
 * at send time, so classic header smuggling is blocked — but without
 * validation a misconfigured scheduled ingest would crash the URL-fetch job
 * instead of erroring at save time. This module enforces:
 *
 * - RFC 9110 token grammar for header names
 * - No CR / LF / NUL / control characters in values
 * - Denylist of hop-by-hop and connection-control headers
 * - Max 32 headers total, max 4 KiB combined serialized size
 *
 * @module
 * @category Ingest
 */

/** RFC 9110 / 7230 tchar set — allowed characters in an HTTP field name. */
const HEADER_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Values may contain any VCHAR plus SP / HTAB, plus obs-text (bytes ≥ 0x80)
 * for UTF-8-encoded values. Explicitly disallowed: CR, LF, NUL, and the
 * remaining C0 control characters — these are the smuggling vectors.
 *
 * The regex deliberately matches control chars: that's what we're blocking.
 */
// eslint-disable-next-line sonarjs/no-control-regex -- Intentional: reject C0 control chars in header values
const HEADER_VALUE_FORBIDDEN = /[\x00-\x08\x0A-\x1F\x7F]/;

/** Hop-by-hop / connection-control headers a user must not set directly. */
const DENYLIST = new Set(
  [
    "host",
    "content-length",
    "transfer-encoding",
    "connection",
    "upgrade",
    "te",
    "proxy-connection",
    "proxy-authenticate",
    "proxy-authorization",
    "keep-alive",
  ].map((h) => h.toLowerCase())
);

export const MAX_CUSTOM_HEADERS = 32;
export const MAX_CUSTOM_HEADERS_BYTES = 4 * 1024;

export interface ValidateCustomHeadersResult {
  ok: boolean;
  headers?: Record<string, string>;
  error?: string;
}

/** Coerce raw input (object or JSON string) to a plain entry array, or error. */
const toHeaderEntries = (
  raw: unknown
): { ok: true; entries: Array<[string, unknown]> } | { ok: false; error: string } => {
  if (raw == null || raw === "") return { ok: true, entries: [] };

  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (e) {
      return { ok: false, error: `customHeaders is not valid JSON: ${(e as Error).message}` };
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "customHeaders must be a JSON object with string values" };
  }

  return { ok: true, entries: Object.entries(parsed as Record<string, unknown>) };
};

/** Validate a single header entry; returns an error string or null on success. */
const validateEntry = (name: string, value: unknown, seen: Set<string>): string | null => {
  if (typeof name !== "string" || name.length === 0) return "customHeaders contains an empty header name";
  if (!HEADER_NAME_REGEX.test(name)) return `Invalid customHeaders name: ${JSON.stringify(name)}`;
  if (typeof value !== "string") return `customHeaders value for "${name}" must be a string (got ${typeof value})`;
  if (HEADER_VALUE_FORBIDDEN.test(value))
    return `customHeaders value for "${name}" contains disallowed control characters`;

  const lower = name.toLowerCase();
  if (DENYLIST.has(lower)) return `customHeaders may not set "${name}" (reserved/hop-by-hop)`;
  if (seen.has(lower)) return `customHeaders contains duplicate header "${name}"`;
  seen.add(lower);
  return null;
};

/**
 * Parse + validate a user-supplied customHeaders blob.
 *
 * Accepts either a parsed object (JSON column) or a JSON-encoded string.
 * Returns the normalized header map on success, or a human-readable error.
 */
export const validateCustomHeaders = (raw: unknown): ValidateCustomHeadersResult => {
  const parsedEntries = toHeaderEntries(raw);
  if (!parsedEntries.ok) return { ok: false, error: parsedEntries.error };
  const { entries } = parsedEntries;

  if (entries.length > MAX_CUSTOM_HEADERS) {
    return { ok: false, error: `customHeaders exceeds maximum of ${MAX_CUSTOM_HEADERS} headers` };
  }

  const out: Record<string, string> = {};
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const [name, value] of entries) {
    const err = validateEntry(name, value, seen);
    if (err) return { ok: false, error: err };

    // Approximate wire-size budget: `Name: Value\r\n`
    totalBytes += Buffer.byteLength(name, "utf-8") + 2 + Buffer.byteLength(value as string, "utf-8") + 2;
    if (totalBytes > MAX_CUSTOM_HEADERS_BYTES) {
      return { ok: false, error: `customHeaders combined size exceeds ${MAX_CUSTOM_HEADERS_BYTES} bytes` };
    }

    out[name] = value as string;
  }

  return { ok: true, headers: out };
};
