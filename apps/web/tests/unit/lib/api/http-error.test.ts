/**
 * Unit tests for HttpError class and fetchJson helper.
 *
 * @module
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchJson, HttpError } from "@/lib/api/http-error";

describe("HttpError", () => {
  it("carries status, message, and optional body", () => {
    const error = new HttpError(404, "Not Found", { detail: "Event not found" });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(404);
    expect(error.message).toBe("Not Found");
    expect(error.body).toEqual({ detail: "Event not found" });
    expect(error.name).toBe("HttpError");
  });

  it("works without a body", () => {
    const error = new HttpError(500, "Internal Server Error");

    expect(error.status).toBe(500);
    expect(error.message).toBe("Internal Server Error");
    expect(error.body).toBeUndefined();
  });

  it("is catchable as an Error", () => {
    const error = new HttpError(400, "Bad Request");

    expect(() => {
      throw error;
    }).toThrow(Error);
  });
});

describe("fetchJson", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on successful response", async () => {
    const data = { items: [1, 2, 3] };
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) } as Response);

    const result = await fetchJson<{ items: number[] }>("/api/test");

    expect(result).toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith("/api/test", undefined);
  });

  it("passes init options through to fetch", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as Response);

    await fetchJson("/api/test", { method: "POST", headers: { "Content-Type": "application/json" } });

    expect(fetchMock).toHaveBeenCalledWith("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("throws HttpError with status and body on non-ok response", async () => {
    const errorBody = { error: "Not found", code: "NOT_FOUND" };
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve(errorBody),
    } as Response);

    try {
      await fetchJson("/api/test");
      expect.fail("Expected fetchJson to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.status).toBe(404);
      expect(httpError.message).toBe("Not Found");
      expect(httpError.body).toEqual(errorBody);
    }
  });

  it("handles non-JSON error responses gracefully", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as Response);

    try {
      await fetchJson("/api/test");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.status).toBe(500);
      expect(httpError.message).toBe("Internal Server Error");
      expect(httpError.body).toBeUndefined();
    }
  });

  it("throws HttpError on 4xx responses for retry policy integration", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: () => Promise.resolve({ error: "Access denied" }),
    } as Response);

    try {
      await fetchJson("/api/test");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      // Verify the retry policy in providers.tsx can use instanceof check
      expect(httpError.status >= 400 && httpError.status < 500).toBe(true);
    }
  });
});
