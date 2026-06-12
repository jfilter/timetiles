/**
 * Detect whether a task failure inside a Payload workflow will be retried.
 *
 * When a task with `retries` remaining fails, Payload throws a `TaskError`
 * through the awaited `tasks[...]()` call and requeues the job — the workflow
 * handler's catch runs on EVERY attempt, not only the final one. Workflows
 * that record application-level failure state in their catch (e.g. the
 * scheduled-ingest lifecycle counters) must skip non-final attempts.
 *
 * Payload does not export `TaskError` from its root, so this duck-types the
 * error shape (mirrors the repo's handleError convention of structural checks
 * over instanceof for Payload errors).
 *
 * @module
 * @category Jobs
 */

interface TaskErrorLikeArgs {
  taskStatus?: { complete?: boolean; totalTried?: number } | null;
  retriesConfig?: number | { attempts?: number } | null;
}

/**
 * True when the error is a Payload TaskError whose task still has retry
 * attempts left — i.e. Payload will requeue the job and re-run the workflow.
 *
 * Mirrors Payload's `handleTaskError` decision: the failure is final when
 * `taskStatus.totalTried >= retriesConfig.attempts`.
 */
export const taskErrorWillRetry = (error: unknown): boolean => {
  if (!(error instanceof Error) || error.constructor.name !== "TaskError") return false;
  const args = (error as Error & { args?: TaskErrorLikeArgs }).args;
  if (args == null || typeof args !== "object") return false;
  if (args.taskStatus?.complete) return false;

  const retriesConfig = args.retriesConfig;
  const attempts = typeof retriesConfig === "object" ? (retriesConfig?.attempts ?? 0) : (retriesConfig ?? 0);
  return (args.taskStatus?.totalTried ?? 0) < attempts;
};
