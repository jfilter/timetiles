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
export interface TaskCallbackArgs {
  input?: object;
  job: { error?: unknown; id: number | string };
  req: { payload: Payload };
  /** Attempts recorded before the current one; null on the first attempt. */
  taskStatus?: { totalTried: number } | null;
}

/**
 * Whether Payload will give up on the task after this failure.
 *
 * Payload calls `onFail` on every failed attempt, before it decides to retry; this
 * mirrors its check (`totalTried` counts earlier attempts, `retries` the allowed retries).
 */
export const isFinalAttempt = (args: TaskCallbackArgs, retries: number): boolean =>
  (args.taskStatus?.totalTried ?? 0) >= retries;
