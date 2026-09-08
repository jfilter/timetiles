/**
 * Regression tests for favicon download failure handling.
 * @module
 * @category Tests
 */
import { mockLogger } from "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/security/safe-fetch", () => ({ safeFetch: mocks.safeFetch }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateFaviconsHook } from "@/lib/globals/branding-hooks";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { createMockPayload } from "@/tests/setup/factories";

describe("favicon download failures", () => {
  const url = `https://example.com/image.png?token=${TEST_CREDENTIALS.bearer.token}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const runHook = async () => {
    const payload = createMockPayload();
    payload.findByID.mockResolvedValue({ id: 1, url });
    const doc = { faviconSourceLight: 1 };
    expect(await generateFaviconsHook({ doc, previousDoc: {}, req: { payload } } as never)).toBe(doc);
  };

  it.each([false, true])("discards HTTP error bodies without logging URLs (cancel fails: %s)", async (cancelFails) => {
    const cancel = cancelFails ? vi.fn().mockRejectedValue(new Error(url)) : vi.fn().mockResolvedValue(undefined);
    mocks.safeFetch.mockResolvedValue({ ok: false, status: 503, body: { cancel } });

    await runHook();

    expect(cancel).toHaveBeenCalledOnce();
    expect(mockLogger.logger.warn).toHaveBeenCalledWith({ mediaId: "1", status: 503 }, "Failed to fetch media file");
    expect(JSON.stringify(mockLogger.logger.warn.mock.calls)).not.toContain(url);
    expect(mockLogger.logError).not.toHaveBeenCalled();
  });

  it("does not persist transport errors that may contain signed URLs", async () => {
    mocks.safeFetch.mockRejectedValue(new Error(`Request failed: ${url}`));

    await runHook();

    expect(mockLogger.logger.warn).toHaveBeenCalledWith(
      { mediaId: "1" },
      "Failed to fetch media for favicon generation"
    );
    expect(mockLogger.logError).not.toHaveBeenCalled();
  });
});
