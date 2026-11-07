/**
 * Loopback SOCKS5 proxy that carries a single git clone.
 *
 * git resolves the repository host on its own, after the SSRF guard has vetted
 * it, so a rebinding DNS record could hand git an internal address. Pointing
 * git's `http.proxy` at this proxy with `socks5h://` makes git send the hostname
 * instead of resolving it, and the proxy connects only to the vetted addresses,
 * whatever destination the client names. TLS still runs end to end between git
 * and the server, so certificate and hostname verification are unchanged.
 *
 * The proxy also counts the bytes the server sends and cuts every connection
 * once they exceed the budget, which bounds the clone while it is transferred.
 *
 * @module
 * @category Lib
 */

import type { Socket } from "node:net";
import { connect, createServer } from "node:net";

const SOCKS_VERSION = 5;
const CMD_CONNECT = 1;
const ADDRESS_IPV4 = 1;
const ADDRESS_DOMAIN = 3;
const ADDRESS_IPV6 = 4;
const REPLY_SUCCEEDED = 0;
const REPLY_GENERAL_FAILURE = 1;
const REPLY_CONNECTION_REFUSED = 5;
const REPLY_COMMAND_NOT_SUPPORTED = 7;

export interface GitEgressTarget {
  /** Addresses the SSRF guard vetted; tried in order. */
  addresses: string[];
  port: number;
}

export interface GitEgressProxy {
  /** Value for git's `http.proxy`. */
  url: string;
  /** Whether the server sent more than the byte budget. */
  exceeded: () => boolean;
  close: () => Promise<void>;
}

/** Read exactly `size` bytes from a paused socket; rejects if it ends first. */
const readExactly = (socket: Socket, size: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    if (size === 0) {
      resolve(Buffer.alloc(0));
      return;
    }
    const settle = (chunk: Buffer | null): void => {
      socket.off("readable", onReadable);
      socket.off("end", onEnd);
      socket.off("close", onEnd);
      if (chunk?.length === size) resolve(chunk);
      else reject(new Error("SOCKS client closed during the handshake"));
    };
    const onReadable = (): void => {
      const chunk = socket.read(size) as Buffer | null;
      if (chunk !== null) settle(chunk);
    };
    const onEnd = (): void => settle(null);
    socket.on("readable", onReadable);
    socket.on("end", onEnd);
    socket.on("close", onEnd);
    onReadable();
  });

const reply = (code: number): Buffer => Buffer.from([SOCKS_VERSION, code, 0, ADDRESS_IPV4, 0, 0, 0, 0, 0, 0]);

/** Consume a CONNECT request; the destination it names is read and discarded. */
const readConnectRequest = async (client: Socket): Promise<boolean> => {
  const [version, methodCount = 0] = await readExactly(client, 2);
  const methods = await readExactly(client, methodCount);
  if (version !== SOCKS_VERSION || !methods.includes(0)) return false;
  client.write(Buffer.from([SOCKS_VERSION, 0]));

  const [, command, , addressType] = await readExactly(client, 4);
  if (addressType === ADDRESS_IPV4) await readExactly(client, 4);
  else if (addressType === ADDRESS_IPV6) await readExactly(client, 16);
  else if (addressType === ADDRESS_DOMAIN) await readExactly(client, (await readExactly(client, 1))[0] ?? 0);
  else return false;
  await readExactly(client, 2);
  return command === CMD_CONNECT;
};

const connectTo = (host: string, port: number, track: (socket: Socket) => void): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    track(socket);
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.off("error", reject);
      resolve(socket);
    });
  });

/**
 * Start the proxy on an ephemeral loopback port.
 *
 * @param target - Vetted addresses and the port of the repository URL.
 * @param maxBytes - Budget for bytes received from the server, across all connections.
 */
export const startGitEgressProxy = async (target: GitEgressTarget, maxBytes: number): Promise<GitEgressProxy> => {
  const sockets = new Set<Socket>();
  let received = 0;
  let overBudget = false;

  const track = (socket: Socket): void => {
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
  };
  const destroyAll = (): void => {
    for (const socket of sockets) socket.destroy();
  };

  const connectUpstream = async (): Promise<Socket | undefined> => {
    for (const address of target.addresses) {
      try {
        return await connectTo(address, target.port, track);
      } catch {
        // The next vetted address may answer.
      }
    }
    return undefined;
  };

  const handle = async (client: Socket): Promise<void> => {
    if (!(await readConnectRequest(client))) {
      client.end(reply(REPLY_COMMAND_NOT_SUPPORTED));
      return;
    }
    const upstream = await connectUpstream();
    if (!upstream) {
      client.end(reply(REPLY_CONNECTION_REFUSED));
      return;
    }
    upstream.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        overBudget = true;
        destroyAll();
      }
    });
    upstream.on("close", () => client.destroy());
    client.on("close", () => upstream.destroy());
    client.write(reply(REPLY_SUCCEEDED));
    client.pipe(upstream);
    upstream.pipe(client);
  };

  const serve = async (client: Socket): Promise<void> => {
    track(client);
    if (overBudget) {
      client.destroy();
      return;
    }
    try {
      await handle(client);
    } catch {
      if (!client.destroyed) client.end(reply(REPLY_GENERAL_FAILURE));
    }
  };

  const server = createServer((client) => {
    void serve(client);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Git egress proxy has no TCP address");

  return {
    url: `socks5h://127.0.0.1:${address.port}`,
    exceeded: () => overBudget,
    close: () =>
      new Promise((resolve) => {
        destroyAll();
        server.close(() => resolve());
      }),
  };
};
