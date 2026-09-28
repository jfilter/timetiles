/**
 * Unit tests for dataset lookup errors in SchemaInferenceService.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";

import { SchemaInferenceService } from "@/lib/ingest/schema-inference";

describe("SchemaInferenceService dataset lookup", () => {
  it("rethrows lookup failures other than not found", async () => {
    const payload = { findByID: vi.fn().mockRejectedValue(new Error("connection refused")) } as unknown as Payload;

    await expect(SchemaInferenceService.inferSchemaFromEvents(payload, 1)).rejects.toThrow("connection refused");
  });
});
