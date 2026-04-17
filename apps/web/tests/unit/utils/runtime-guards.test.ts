/**
 * Unit tests for E2E runtime guards.
 *
 * @module
 * @category Unit Tests
 */

import { spawn } from "node:child_process";
import { createServer, type Server } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertPortAvailable,
  isPortInUse,
  isProcessRunning,
  terminateProcess,
  waitForPortToBeFree,
  waitForProcessExit,
} from "@/tests/e2e/utils/runtime-guards";

const openServers: Server[] = [];
const childPids: number[] = [];

const startServer = async (): Promise<{ port: number; server: Server }> => {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  openServers.push(server);
  const address = server.address();
  if (typeof address === "string" || address == null) {
    throw new Error("Expected server to listen on a TCP port");
  }

  return { port: address.port, server };
};

afterEach(async () => {
  while (openServers.length > 0) {
    const server = openServers.pop();
    if (!server?.listening) {
      continue;
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  while (childPids.length > 0) {
    const pid = childPids.pop();
    if (!pid) {
      continue;
    }

    await terminateProcess(pid, "test cleanup").catch(() => undefined);
  }
});

describe("runtime guards", () => {
  it("detects ports that are already in use", async () => {
    const { port } = await startServer();

    await expect(isPortInUse(port)).resolves.toBe(true);
    await expect(assertPortAvailable(port, "E2E server")).rejects.toThrow(/already in use/);
  });

  it("waits for a port to become free", async () => {
    const { port, server } = await startServer();
    const waitPromise = waitForPortToBeFree(port, 1000, 25);

    setTimeout(() => {
      server.close();
    }, 50);

    await expect(waitPromise).resolves.toBeUndefined();
  });

  it("terminates detached child processes and waits for them to exit", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
    child.unref();

    if (!child.pid) {
      throw new Error("Expected detached child process to have a PID");
    }

    childPids.push(child.pid);

    const started = Date.now();
    while (!isProcessRunning(child.pid) && Date.now() - started < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(isProcessRunning(child.pid)).toBe(true);
    await terminateProcess(child.pid, "test child", { graceTimeoutMs: 2000, pollMs: 25 });

    childPids.splice(childPids.indexOf(child.pid), 1);
    await expect(waitForProcessExit(child.pid, 200, 25)).resolves.toBe(true);
  });
});
