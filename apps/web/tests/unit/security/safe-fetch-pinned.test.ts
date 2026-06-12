/**
 * Regression test for the pinned-dispatcher fetch pairing.
 *
 * Node's global fetch ships its own bundled undici, whose internal handler
 * shape the npm undici package's Agent does not accept (undici 8 throws
 * `InvalidArgumentError: invalid onRequestStart method` before any byte hits
 * the network). Every DNS-pinned production request failed because of this.
 * The pinned path must pair the npm Agent with the npm package's own fetch —
 * this test exercises the REAL fetch + Agent combination against a real
 * local server, so it lives apart from safe-fetch.test.ts (which mocks both
 * fetch implementations).
 *
 * @module
 * @category Tests
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

import { Agent } from "undici";
import { describe, expect, it } from "vitest";

import { fetchWithDispatcher } from "@/lib/security/safe-fetch";

describe("fetchWithDispatcher pinned-agent pairing", () => {
  it("completes a real request through a pinned npm-undici Agent", async () => {
    const server = http.createServer((_req, res) => {
      res.end("pinned-ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const pinnedAgent = new Agent({
      connect: {
        // oxlint-disable-next-line no-explicit-any -- mirrors buildPinnedDispatcher's callback shape
        lookup: ((_host: string, _opts: unknown, cb: any) => cb(null, [{ address: "127.0.0.1", family: 4 }])) as never,
      },
    });

    try {
      const response = await fetchWithDispatcher(`http://localhost:${port}/`, {}, pinnedAgent);
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe("pinned-ok");
    } finally {
      await pinnedAgent.close();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
