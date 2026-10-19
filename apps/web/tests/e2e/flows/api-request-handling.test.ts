/**
 * E2E tests for request handling that only the real HTTP server exercises.
 *
 * Next clones and truncates the body of any request its proxy runs on, and API response
 * headers are set by the server config, so neither shows up in route-level tests.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";

const MiB = 1024 * 1024;

test.describe("API request handling", () => {
  test("accepts an import upload larger than the proxy's 10 MiB body clone limit", async ({ page }) => {
    const row = "Event title,2024-01-01,52.52,13.40\n";
    const rowCount = Math.ceil((12 * MiB) / row.length);
    const csv = Buffer.from(`title,date,lat,lng\n${row.repeat(rowCount)}`);

    const response = await page.request.post("/api/ingest/preview-schema/upload", {
      multipart: { file: { name: "large.csv", mimeType: "text/csv", buffer: csv } },
      timeout: 120_000,
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { sheets: Array<{ rowCount: number }> };
    expect(body.sheets[0]?.rowCount).toBe(rowCount);
  });

  test("serves uploaded files sandboxed", async ({ page }) => {
    // Minimal valid 1x1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );
    const created = await page.request.post("/api/media", {
      multipart: {
        file: { name: `sandbox-${Date.now()}.png`, mimeType: "image/png", buffer: png },
        _payload: JSON.stringify({ alt: "sandbox check" }),
      },
    });
    expect(created.status()).toBe(201);
    const { doc } = (await created.json()) as { doc: { url: string } };

    const file = await page.request.get(doc.url);

    expect(file.status()).toBe(200);
    expect(file.headers()["content-security-policy"]).toContain("sandbox");
    expect(file.headers()["x-content-type-options"]).toBe("nosniff");
    expect(file.headers()["x-frame-options"]).toBe("DENY");
  });
});
