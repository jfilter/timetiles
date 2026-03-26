/**
 * Admin endpoint to detect and fix data inconsistencies.
 *
 * @module
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { runHealChecks } from "@/lib/services/heal-service";

export const POST = apiRoute({
  auth: "admin",
  body: z.object({ dryRun: z.boolean().default(false), checks: z.array(z.string()).optional() }),
  handler: async ({ payload, body }) => {
    const results = await runHealChecks(payload, { dryRun: body.dryRun, checks: body.checks });
    return { results };
  },
});
