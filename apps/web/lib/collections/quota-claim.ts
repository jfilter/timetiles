/**
 * Per-request quota claim lifecycle for collections that meter creates.
 *
 * @module
 * @category Collections
 */
import type { PayloadRequest } from "payload";

import type { QuotaKey } from "@/lib/constants/quota-constants";
import { logError } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";

/** The three hook steps of one metered create. */
export interface QuotaClaimLifecycle {
  /** `beforeChange` on create: enforce the limit, increment usage, and claim compensation. */
  claim: (req: PayloadRequest) => Promise<void>;
  /** `afterChange` on create: the row exists, so the increment is final. */
  clear: (req: PayloadRequest) => void;
  /** `afterError`: hand the increment back, but only if this request still holds the claim. */
  compensate: (req: PayloadRequest) => Promise<void>;
}

/**
 * Build the claim/clear/compensate trio for one quota.
 *
 * The subtle part is when NOT to claim. Payload's create op calls `killTransaction()` in its
 * catch, which rolls the increment back AND deletes `req.transactionID` before `afterError`
 * fires. A compensating decrement would then run outside the already rolled-back transaction
 * and subtract a SECOND time — and since `decrementUsage` floors at 0, alternating one good
 * create with one deliberately failing create pins the counter at 0 and defeats the limit
 * entirely. So compensation is claimed only for a NON-transactional increment; on Postgres the
 * create always runs in a transaction and rolls its own increment back.
 *
 * `contextKey` must be distinct per resource: one shared "quota claimed" slot would let a
 * nested create clear the outer one's claim.
 */
export const createQuotaClaimLifecycle = ({
  contextKey,
  quotaKey,
}: {
  contextKey: string;
  quotaKey: QuotaKey;
}): QuotaClaimLifecycle => {
  type ClaimingRequest = PayloadRequest & Record<string, string | number | undefined>;

  const readClaim = (req: PayloadRequest): string | number | undefined => (req as ClaimingRequest)[contextKey];
  const writeClaim = (req: PayloadRequest, userId: string | number | undefined): void => {
    (req as ClaimingRequest)[contextKey] = userId;
  };

  return {
    claim: async (req) => {
      if (!req.user) return;

      await createQuotaService(req.payload).checkAndIncrementUsage(req.user, quotaKey, 1, req);

      if (req.transactionID) return;
      writeClaim(req, req.user.id);
    },

    clear: (req) => {
      writeClaim(req, undefined);
    },

    compensate: async (req) => {
      const userId = readClaim(req);
      if (userId == null) return;

      writeClaim(req, undefined);

      try {
        await createQuotaService(req.payload).decrementUsage(userId, quotaKey, 1, req);
      } catch (error) {
        logError(error, `Failed to compensate ${quotaKey} after a failed create`, { userId });
      }
    },
  };
};
