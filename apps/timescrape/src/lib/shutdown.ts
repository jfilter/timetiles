/**
 * Graceful shutdown for the runner process.
 *
 * @module
 * @category Lib
 */

import { logger } from "./logger.js";

export interface ShutdownDeps {
  /** Stops accepting connections; calls `done` once every open connection has ended. */
  closeServer: (done: () => void) => void;
  getActiveRunIds: () => string[];
  stopRun: (runId: string) => Promise<void>;
  exit: (code: number) => void;
}

/**
 * Build a signal handler that stops in-flight containers before exiting.
 *
 * Runs are stopped immediately rather than after `closeServer` completes: an
 * open `/run` request keeps the server from closing until its container exits,
 * so waiting for the close first would leave every container running.
 */
export const createShutdownHandler = (deps: ShutdownDeps): ((signal: NodeJS.Signals) => Promise<void>) => {
  let shuttingDown = false;

  return async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    const runIds = deps.getActiveRunIds();
    logger.info({ signal, activeRuns: runIds.length }, "Shutting down TimeScrape runner");

    const serverClosed = new Promise<void>((resolve) => deps.closeServer(resolve));
    await Promise.allSettled(runIds.map((runId) => deps.stopRun(runId)));
    await serverClosed;
    deps.exit(0);
  };
};
