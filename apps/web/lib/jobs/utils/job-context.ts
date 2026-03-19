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
