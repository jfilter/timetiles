/**
 * Unit tests for the ingest-files upload MIME allow-list.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({ getEnv: () => ({ UPLOAD_DIR: "uploads" }) }));

import IngestFiles from "@/lib/collections/ingest-files";

describe("ingest-files upload mimeTypes", () => {
  it("accepts only types a file reader can parse", () => {
    const upload = IngestFiles.upload as { mimeTypes: string[] };
    expect(upload.mimeTypes).not.toContain("application/vnd.google-apps.spreadsheet");
    expect(upload.mimeTypes).toContain("text/csv");
  });
});
