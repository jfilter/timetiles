/**
 * Activate a data package: create catalog, dataset, and scheduled ingest.
 *
 * @module
 */
import { z } from "zod";

import { apiRoute, ConflictError, NotFoundError, requireFeatureEnabled } from "@/lib/api";
import { activateDataPackage } from "@/lib/data-packages/activation-service";
import { loadManifest } from "@/lib/data-packages/manifest-loader";

export const POST = apiRoute({
  auth: "required",
  params: z.object({ slug: z.string().min(1) }),
  body: z.object({
    triggerFirstImport: z.boolean().default(true),
    parameters: z.record(z.string(), z.string()).optional(),
  }),
  handler: async ({ user, req, payload, params, body }) => {
    const manifest = loadManifest(params.slug);
    if (!manifest) {
      throw new NotFoundError(`Data package "${params.slug}" not found`);
    }

    // Activation creates an active scheduled ingest (a recurring remote fetch),
    // so it is gated behind the same feature flag that guards manual schedule
    // creation. Even admins cannot activate when the feature is disabled.
    await requireFeatureEnabled(payload, "enableScheduledIngests", "Scheduled imports are currently disabled.");

    try {
      // Pass `req` so the acting user is threaded into the scheduled-ingest
      // create — this makes the maxActiveSchedules quota hook fire (it skips
      // when there is no `req.user`) instead of being bypassed by overrideAccess.
      const result = await activateDataPackage(payload, manifest, user, {
        triggerFirstImport: body.triggerFirstImport,
        parameters: body.parameters,
        req,
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
