/**
 * Runtime guards for E2E setup and teardown.
 *
 * Helps detect stale server processes, wait for detached processes to exit,
 * and verify that fixed worktree ports are actually free before reuse.
 *
 * @module
 * @category E2E Utils
 */

import { createConnection } from "node:net";

const DEFAULT_PORT_TIMEOUT_MS = 10000;
const DEFAULT_PROCESS_TIMEOUT_MS = 10000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const SOCKET_TIMEOUT_MS = 1000;

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const isMissingProcessError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ESRCH";

const signalProcess = (pid: number, signal: NodeJS.Signals): boolean => {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (!isMissingProcessError(error)) {
      try {
        process.kill(pid, signal);
        return true;
      } catch (fallbackError) {
        if (isMissingProcessError(fallbackError)) {
          return false;
        }
        throw fallbackError;
      }
    }
  }

  return false;
};

export const isProcessRunning = (pid: number): boolean => {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isMissingProcessError(error)) {
      return false;
    }
    throw error;
  }
};

export const waitForProcessExit = async (
  pid: number,
  timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_INTERVAL_MS
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await sleep(pollMs);
  }

  return !isProcessRunning(pid);
};

export const terminateProcess = async (
  pid: number,
  label: string,
  options: { graceTimeoutMs?: number; pollMs?: number } = {}
): Promise<void> => {
  if (!Number.isFinite(pid) || pid <= 0) {
    return;
  }

  const { graceTimeoutMs = DEFAULT_PROCESS_TIMEOUT_MS, pollMs = DEFAULT_POLL_INTERVAL_MS } = options;

  const signaled = signalProcess(pid, "SIGTERM");
  if (!signaled) {
    return;
  }

  if (await waitForProcessExit(pid, graceTimeoutMs, pollMs)) {
    return;
  }

  signalProcess(pid, "SIGKILL");
  if (await waitForProcessExit(pid, 2000, pollMs)) {
    return;
  }

  throw new Error(`Timed out waiting for ${label} (PID ${pid}) to exit`);
};

export const isPortInUse = async (port: number, host = "127.0.0.1"): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ port, host });
    let settled = false;

    const finish = (value: boolean, error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.removeAllListeners();
      socket.destroy();

      if (error) {
        reject(error);
        return;
      }

      resolve(value);
    };

    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED" || error.code === "EHOSTUNREACH" || error.code === "ENETUNREACH") {
        finish(false);
        return;
      }

      finish(false, error);
    });
    socket.setTimeout(SOCKET_TIMEOUT_MS);
  });
};

export const assertPortAvailable = async (port: number, label: string): Promise<void> => {
  if (await isPortInUse(port)) {
    throw new Error(`${label} port ${port} is already in use. A stale E2E server may still be running.`);
  }
};

/**
 * Find a free port at or after `basePort`, scanning upward within the worktree's
 * 100-port lane.
 *
 * The deterministic base from {@link getWorktreeBasePort} keeps simultaneous
 * worktree runs in separate lanes, but it can still collide with an unrelated
 * local service (another project's container, a stray dev server). Rather than
 * hard-failing, prefer the base and fall back to the next free port in the same
 * lane, so an external occupant of the base port no longer blocks the whole run.
 *
 * Scans are sequential and ordered so the lowest free port wins (the await runs
 * one probe at a time on purpose — parallelizing would lose the "prefer base"
 * ordering).
 */
export const findAvailablePort = async (basePort: number, label: string, maxAttempts = 50): Promise<number> => {
  for (let port = basePort; port < basePort + maxAttempts; port += 1) {
    let inUse: boolean;
    try {
      // eslint-disable-next-line no-await-in-loop -- intentional: probe ports in order, lowest free wins
      inUse = await isPortInUse(port);
    } catch {
      // Ambiguous probe failure (e.g. connection reset by an occupant): treat as
      // unavailable so we never hand back a port we couldn't verify as free.
      inUse = true;
    }
    if (!inUse) {
      if (port !== basePort) {
        console.warn(`⚠️ ${label} base port ${basePort} is busy; using ${port} instead`);
      }
      return port;
    }
  }
  throw new Error(
    `${label}: no free port in range ${basePort}-${basePort + maxAttempts - 1}. ` +
      `Free a port in that range (e.g. stop a conflicting local service).`
  );
};

export const waitForPortToBeFree = async (
  port: number,
  timeoutMs = DEFAULT_PORT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_INTERVAL_MS
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!(await isPortInUse(port))) {
      return;
    }
    await sleep(pollMs);
  }

  if (await isPortInUse(port)) {
    throw new Error(`Timed out waiting for port ${port} to become available`);
  }
};
