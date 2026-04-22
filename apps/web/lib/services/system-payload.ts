/**
 * Typed wrappers for background-job data access that always run with
 * `overrideAccess: true`.
 *
 * Jobs legitimately need to bypass user-facing access control — they run as
 * the system, not as any user. Sprinkling `overrideAccess: true` across the
 * codebase is technically correct but makes grep + code review harder: it
 * looks identical to an accidental permission escalation in a user-facing
 * request path. This module makes the intent explicit at the call site and
 * gives security reviewers a single narrow surface to audit.
 *
 * **Usage pattern:**
 *
 *     const sys = asSystem(payload);
 *     await sys.update({ collection: "ingest-jobs", id, data: { stage } });
 *     // ↑ equivalent to payload.update({ ..., overrideAccess: true })
 *
 * The wrapper keeps Payload's original generics and overload signatures
 * intact — callers get the same per-collection type inference they would
 * from a raw `payload.X` call. At runtime each method reinjects
 * `overrideAccess: true` into the first argument regardless of what the
 * caller passed, so accidentally forwarding user-scoped overrides is
 * impossible.
 *
 * @module
 * @category Services
 */

import type { Payload } from "payload";

/**
 * Lazily wrap a single Payload data-access method so it always runs with
 * `overrideAccess: true`. Preserves the original overloaded signature via
 * `typeof` — the caller sees the exact same API as Payload itself.
 *
 * Lazy lookup (inside the returned function) matters for tests that mock
 * only the methods their handler uses: eagerly binding every method at
 * construction time would crash when a mock Payload instance lacks, say,
 * `findGlobal`.
 */
type MethodName = "create" | "update" | "delete" | "find" | "findByID" | "count" | "findGlobal" | "updateGlobal";

const wrap = <K extends MethodName>(payload: Payload, name: K): Payload[K] => {
  return ((args: Record<string, unknown>, ...rest: unknown[]) => {
    const fn = payload[name] as unknown as (a: Record<string, unknown>, ...r: unknown[]) => unknown;
    return fn.call(payload, { ...args, overrideAccess: true }, ...rest);
  }) as unknown as Payload[K];
};

/**
 * Thin wrapper around Payload that forces `overrideAccess: true` on every
 * data-access call. Each method keeps the exact signature of its Payload
 * counterpart.
 */
export interface SystemPayload {
  readonly payload: Payload;
  create: Payload["create"];
  update: Payload["update"];
  delete: Payload["delete"];
  find: Payload["find"];
  findByID: Payload["findByID"];
  count: Payload["count"];
  findGlobal: Payload["findGlobal"];
  updateGlobal: Payload["updateGlobal"];
}

/**
 * Wrap a Payload instance so its data-access methods all force
 * `overrideAccess: true`. Use in background job handlers and system
 * maintenance code.
 */
export const asSystem = (payload: Payload): SystemPayload => ({
  payload,
  create: wrap(payload, "create"),
  update: wrap(payload, "update"),
  delete: wrap(payload, "delete"),
  find: wrap(payload, "find"),
  findByID: wrap(payload, "findByID"),
  count: wrap(payload, "count"),
  findGlobal: wrap(payload, "findGlobal"),
  updateGlobal: wrap(payload, "updateGlobal"),
});
