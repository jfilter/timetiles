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
