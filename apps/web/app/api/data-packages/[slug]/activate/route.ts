/**
 * Activate a data package: create catalog, dataset, and scheduled ingest.
 *
 * @module
 */
import { z } from "zod";

import { apiRoute, ConflictError, NotFoundError } from "@/lib/api";
import { activateDataPackage } from "@/lib/data-packages/activation-service";
import { loadManifest } from "@/lib/data-packages/manifest-loader";

export const POST = apiRoute({
  auth: "required",
  params: z.object({ slug: z.string().min(1) }),
  body: z.object({
    triggerFirstImport: z.boolean().default(true),
    parameters: z.record(z.string(), z.string()).optional(),
  }),
  handler: async ({ user, payload, params, body }) => {
    const manifest = loadManifest(params.slug);
    if (!manifest) {
      throw new NotFoundError(`Data package "${params.slug}" not found`);
    }

    try {
      const result = await activateDataPackage(payload, manifest, user, {
        triggerFirstImport: body.triggerFirstImport,
        parameters: body.parameters,
      });
      return { ...result };
    } catch (error) {
      if (error instanceof Error && error.message.includes("already activated")) {
        throw new ConflictError(error.message);
      }
      throw error;
    }
  },
});
