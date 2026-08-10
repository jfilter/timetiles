/**
 * API endpoint for checking user quotas and usage.
 *
 * GET /api/quotas - Returns current user's quota status
 *
 * @module
 */

import { apiRoute } from "@/lib/api";
import type { PublicQuotaKey } from "@/lib/constants/quota-constants";
import { PUBLIC_QUOTAS, QUOTAS } from "@/lib/constants/quota-constants";
import { createQuotaService } from "@/lib/services/quota-service";

/** Response entry for a quota: usage-bearing quotas add `used`/`remaining`. */
interface PublicQuotaEntry {
  limit: number;
  used?: number;
  remaining?: number;
}

/**
 * Cap the displayed limit.
 *
 * Security: privileged accounts have unlimited (-1) or very high quotas, which
 * would make them identifiable. Both are reported as the cap instead.
 */
const normalizeLimit = (limit: number | null | undefined, cap: number): number => {
  if (limit == null || limit === -1 || limit > cap) return cap;
  return limit;
};

/**
 * Get current user's quota status.
 *
 * Returns the quotas listed in {@link PUBLIC_QUOTAS}: limits for all of them
 * and, where a counter exists, current usage and the remaining allowance.
 */
export const GET = apiRoute({
  auth: "required",
  rateLimit: { type: "API_GENERAL" },
  handler: async ({ user, payload }) => {
    const quotaService = createQuotaService(payload);

    // Per-request cache: all checks share one DB lookup for the usage record
    const cache = { context: {} as Record<string, unknown> };
    const effectiveQuotas = quotaService.getEffectiveQuotas(user);

    const publicKeys = Object.keys(PUBLIC_QUOTAS) as PublicQuotaKey[];
    const usageKeys = publicKeys.filter((key) => PUBLIC_QUOTAS[key].exposesUsage);

    const usageResults = await Promise.all(usageKeys.map((key) => quotaService.checkQuota(user, key, 1, cache)));
    const usageByKey = new Map(usageKeys.map((key, index) => [key, usageResults[index]!]));

    const quotas: Record<string, PublicQuotaEntry> = {};
    for (const key of publicKeys) {
      const descriptor = PUBLIC_QUOTAS[key];
      if (descriptor.exposesUsage) {
        const result = usageByKey.get(key)!;
        const limit = normalizeLimit(result.limit, descriptor.displayCap);
        // `remaining` is derived from the DISPLAYED limit; echoing the raw value
        // would defeat the cap above and re-identify a privileged account.
        quotas[descriptor.responseKey] = {
          used: result.current,
          limit,
          remaining: Math.max(0, limit - result.current),
        };
      } else {
        const rawLimit = effectiveQuotas[QUOTAS[key].limitField];
        quotas[descriptor.responseKey] = { limit: normalizeLimit(rawLimit, descriptor.displayCap) };
      }
    }

    // Only necessary information — no role, trust level, or system internals
    const response = { quotas };

    // Add quota headers — requires explicit Response to set custom headers
    const headers = await quotaService.getQuotaHeaders(user);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json", ...headers },
    });
  },
});
