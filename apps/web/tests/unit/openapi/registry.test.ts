/**
 * Unit tests for the OpenAPI registry.
 *
 * @module
 * @category Unit Tests
 */
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import { registry } from "@/lib/openapi/registry";
import type { DataSourcesResponseSchema } from "@/lib/schemas/data-sources";
import type { BoundsResponseSchema } from "@/lib/schemas/events";
import type { SchemaInferenceResponseSchema } from "@/lib/schemas/schema-inference";
import type { PaginatedDataSourcesResponse } from "@/lib/types/data-sources";
import type { BoundsResponse } from "@/lib/types/event-bounds";
import type { SchemaInferenceResponse } from "@/lib/types/schema-inference";

const generateDocument = () =>
  new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: { title: "test", version: "0" },
  });

/** The versioned public routes listed in the REST API documentation. */
const PUBLIC_V1_PATHS = [
  "/api/v1/events",
  "/api/v1/events/geo",
  "/api/v1/events/geo/stats",
  "/api/v1/events/bounds",
  "/api/v1/events/temporal",
  "/api/v1/events/stats",
  "/api/v1/data-sources",
  "/api/v1/sources/stats",
  "/api/v1/datasets/{id}/schema/infer",
];

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

  it("documents every public v1 route", () => {
    expect(Object.keys(generateDocument().paths)).toEqual(expect.arrayContaining(PUBLIC_V1_PATHS));
  });

  it("documents query validation failures with the status apiRoute returns", () => {
    for (const [path, item] of Object.entries(generateDocument().paths)) {
      const operation = item.get;
      if (!operation?.parameters?.length) continue;
      expect(Object.keys(operation.responses), path).toContain("422");
      expect(Object.keys(operation.responses), path).not.toContain("400");
    }
  });

  it("keeps response schemas in step with the types clients consume", () => {
    expectTypeOf<z.infer<typeof BoundsResponseSchema>>().toEqualTypeOf<BoundsResponse>();
    expectTypeOf<z.infer<typeof DataSourcesResponseSchema>>().toEqualTypeOf<PaginatedDataSourcesResponse>();
    expectTypeOf<z.infer<typeof SchemaInferenceResponseSchema>>().toEqualTypeOf<SchemaInferenceResponse>();
  });
});
