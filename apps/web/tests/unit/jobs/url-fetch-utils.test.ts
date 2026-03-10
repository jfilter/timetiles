// @vitest-environment node
/**
 * Unit tests for URL fetch utility helpers.
 *
 * @module
 */
import "@/tests/mocks/services/logger";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchUrlData } from "@/lib/jobs/handlers/url-fetch-job/fetch-utils";

const createMockResponse = (data: string, headers: Record<string, string> = {}) => {
  const dataBuffer = new TextEncoder().encode(data);

  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(headers),
    body: {
      getReader: () => ({
        read: vi.fn().mockResolvedValueOnce({ done: false, value: dataBuffer }).mockResolvedValueOnce({ done: true }),
      }),
    },
  } as unknown as Response;
};

describe.sequential("fetchUrlData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores malformed content-length headers and enforces size using the actual body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createMockResponse("ok", { "content-length": "9abc", "content-type": "text/plain" })
    );

    const result = await fetchUrlData("https://example.com/data.txt", { maxSize: 8 });

    expect(result.data.toString("utf8")).toBe("ok");
    expect(result.contentLength).toBe(2);
    expect(result.contentType).toBe("text/plain");
  });
});
