/**
 * Deactivate a data package by disabling its scheduled ingest.
 *
 * @module
 */
import { z } from "zod";

import { apiRoute, ForbiddenError, NotFoundError } from "@/lib/api";
import { deactivateDataPackage } from "@/lib/data-packages/activation-service";
import { loadManifest } from "@/lib/data-packages/manifest-loader";

export const POST = apiRoute({
  auth: "required",
  params: z.object({ slug: z.string().min(1) }),
  handler: async ({ user, payload, params }) => {
    const manifest = loadManifest(params.slug);
    if (!manifest) {
      throw new NotFoundError(`Data package "${params.slug}" not found`);
    }

    try {
      await deactivateDataPackage(payload, params.slug, user);
      return { success: true };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("not activated")) throw new NotFoundError(error.message);
        if (error.message.includes("only deactivate")) throw new ForbiddenError(error.message);
      }
      throw error;
    }
  },
});
