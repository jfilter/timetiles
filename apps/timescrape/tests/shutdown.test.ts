import { describe, expect, it, vi } from "vitest";

import { createShutdownHandler } from "../src/lib/shutdown.js";

vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn() } }));

describe("createShutdownHandler", () => {
  it("stops active runs while the server is still waiting for open requests", async () => {
    let finishOpenRequests: () => void = () => {};
    const stopRun = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    const handler = createShutdownHandler({
      closeServer: (done) => {
        finishOpenRequests = done;
      },
      getActiveRunIds: () => ["run-a", "run-b"],
      stopRun,
      exit,
    });

    const shutdown = handler("SIGTERM");
    await vi.waitFor(() => expect(stopRun).toHaveBeenCalledTimes(2));
    expect(exit).not.toHaveBeenCalled();

    finishOpenRequests();
    await shutdown;
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("ignores repeated signals", async () => {
    const closeServer = vi.fn((done: () => void) => done());
    const handler = createShutdownHandler({ closeServer, getActiveRunIds: () => [], stopRun: vi.fn(), exit: vi.fn() });

    await handler("SIGTERM");
    await handler("SIGINT");

    expect(closeServer).toHaveBeenCalledTimes(1);
  });
});
