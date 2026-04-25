// @vitest-environment node
/**
 * Unit tests for the centralized API error handler and apiRoute integration.
 *
 * Verifies that unhandled errors leave the generic 500 response shape intact
 * (no stack leak to clients) while logging the underlying error with the
 * request context server-side. The latter is the only way to diagnose a
 * transient 500 in production logs without changing the response shape.
 *
 * @module
 * @category Tests
 */

// 1. Centralized mocks FIRST
import "@/tests/mocks/services/logger";

// 2. vi.hoisted for values needed in vi.mock factories
const mocks = vi.hoisted(() => ({ mockPayload: { auth: vi.fn() }, mockGetPayload: vi.fn() }));

// 3. vi.mock calls
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/middleware/auth", () => ({}));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve(null)) }));

// 4. Vitest imports and source code AFTER mocks
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRoute, handleError, ValidationError } from "@/lib/api";
import { mockLogger } from "@/tests/mocks/services/logger";

const routeContext = { params: Promise.resolve({}) };

describe.sequential("handleError", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 500 with generic body for unhandled errors (no stack leak)", () => {
    const err = new Error("boom — internal db connection failed");
    const response = handleError(err);

    expect(response.status).toBe(500);
  });

  it("does NOT include stack or original message in the response body", async () => {
    const err = new Error("boom — internal db connection failed");
    err.stack = "Error: boom\n    at handler.ts:42";
    const response = handleError(err);
    const body = await response.json();

    // Generic shape only — no leakage
    expect(body).toEqual({ error: "Internal server error", code: "INTERNAL_ERROR" });
    expect(JSON.stringify(body)).not.toContain("boom");
    expect(JSON.stringify(body)).not.toContain("handler.ts:42");
  });

  it("logs the underlying error via logError (so stack is captured server-side)", () => {
    const err = new Error("connection refused");
    handleError(err);

    expect(mockLogger.logError).toHaveBeenCalledTimes(1);
    expect(mockLogger.logError).toHaveBeenCalledWith(err, "Unhandled error in API route", undefined);
  });

  it("includes request context (path, method, userId) in the log when provided", () => {
    const err = new Error("connection refused");
    handleError(err, { url: "http://localhost/api/ingest/configure?foo=bar", method: "POST", userId: 42 });

    expect(mockLogger.logError).toHaveBeenCalledWith(
      err,
      "Unhandled error in API route",
      expect.objectContaining({ path: "/api/ingest/configure", query: "?foo=bar", method: "POST", userId: 42 })
    );
  });

  it("falls back to raw url when URL parsing fails", () => {
    const err = new Error("connection refused");
    handleError(err, { url: "not a valid url", method: "POST" });

    expect(mockLogger.logError).toHaveBeenCalledWith(
      err,
      "Unhandled error in API route",
      expect.objectContaining({ url: "not a valid url", method: "POST" })
    );
  });

  it("AppError responses still pass through unchanged (not logged as 500)", () => {
    const err = new ValidationError("preview missing");
    const response = handleError(err);

    expect(response.status).toBe(400);
    // Domain errors don't get the unhandled-error log — they're expected outcomes.
    expect(mockLogger.logError).not.toHaveBeenCalled();
  });
});

describe.sequential("apiRoute integration: error context is forwarded to handleError", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.mockGetPayload.mockResolvedValue(mocks.mockPayload);
    mocks.mockPayload.auth.mockResolvedValue({ user: { id: 7, email: "u@example.com", role: "user" } });
  });

  it("logs request URL, method, and userId when the handler throws after auth", async () => {
    const route = apiRoute({
      auth: "required",
      handler: () => {
        throw new Error("synthetic db timeout in handler");
      },
    });

    const req = {
      url: "http://localhost/api/synthetic-route?retry=1",
      method: "POST",
      headers: new Headers({ host: "localhost" }),
      json: vi.fn().mockResolvedValue({}),
    } as never;

    const response = await route(req, routeContext);

    expect(response.status).toBe(500);

    const body = (await response.json()) as { error: string; code: string };
    expect(body.error).toBe("Internal server error");
    expect(body.code).toBe("INTERNAL_ERROR");

    // The pino-side log gets the full error + request context for post-mortem
    expect(mockLogger.logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "synthetic db timeout in handler" }),
      "Unhandled error in API route",
      expect.objectContaining({ path: "/api/synthetic-route", query: "?retry=1", method: "POST", userId: 7 })
    );
  });

  it("logs request URL even when auth itself throws (userId is omitted)", async () => {
    mocks.mockPayload.auth.mockRejectedValue(new Error("payload init failed"));

    const route = apiRoute({ auth: "required", handler: () => ({ ok: true }) });

    const req = {
      url: "http://localhost/api/auth-failing-route",
      method: "GET",
      headers: new Headers({ host: "localhost" }),
      json: vi.fn().mockResolvedValue({}),
    } as never;

    const response = await route(req, routeContext);
    expect(response.status).toBe(500);

    expect(mockLogger.logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "payload init failed" }),
      "Unhandled error in API route",
      expect.objectContaining({ path: "/api/auth-failing-route", method: "GET" })
    );
    // userId is undefined on the metadata — we should NOT see a userId key
    const metaArg = mockLogger.logError.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(metaArg).toBeDefined();
    expect("userId" in metaArg).toBe(false);
  });
});
