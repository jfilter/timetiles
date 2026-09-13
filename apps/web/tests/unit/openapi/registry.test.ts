/**
 * Unit tests for the OpenAPI registry.
 *
 * @module
 * @category Unit Tests
 */
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { describe, expect, it } from "vitest";

import { registry } from "@/lib/openapi/registry";

const generateDocument = () =>
  new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: { title: "test", version: "0" },
  });

describe("OpenAPI registry", () => {
  it("documents the liveness body and failure statuses that /api/health returns", () => {
    const doc = generateDocument();
    const responses = doc.paths["/api/health"]?.get?.responses ?? {};

    expect(Object.keys(responses)).toEqual(["200", "500", "503"]);
    expect(doc.components?.schemas?.["LivenessResponse"]).toMatchObject({
      type: "object",
      properties: {
        status: { type: "string", enum: ["ok", "error"] },
        database: { type: "string", enum: ["connected", "error"] },
      },
      required: ["status", "database"],
    });
  });
});
