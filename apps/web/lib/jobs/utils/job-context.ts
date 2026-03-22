/**
 * Defines the context type passed to job handlers.
 *
 * @module
 */
import type { Payload } from "payload";

// Job handler context type matching Payload CMS TaskHandler signature
export type JobHandlerContext<T = unknown> = {
  input?: T;
  job?: { id: string | number; taskStatus?: Record<string, unknown>; [key: string]: unknown };
  req: { payload: Payload; user?: unknown };
};

/**
 * Arguments passed to onFail/onSuccess task callbacks.
 * Compatible with Payload's `TaskCallbackArgs` (which is not publicly exported).
 */
export interface TaskFailureCallbackArgs {
  input?: object;
  job: { error?: unknown; id: number | string };
  req: { payload: Payload };
}
