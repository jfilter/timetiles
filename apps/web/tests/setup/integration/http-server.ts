/**
 * Test Server Utilities.
 *
 * Provides reusable HTTP server creation and management for integration tests.
 * Supports various response scenarios including auth, delays, errors, and streaming.
 *
 * @module
 * @category Test Setup
 */

import { createReadStream } from "node:fs";
import * as path from "node:path";

import type { IncomingMessage, Server, ServerResponse } from "http";
import { createServer } from "http";

export interface TestServerOptions {
  port?: number;
  host?: string;
}

export interface ResponseConfig {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Buffer | NodeJS.ReadableStream;
  delay?: number;
  error?: boolean;
}

export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

/**
 * TestServer class for creating configurable HTTP servers for testing.
 */
export class TestServer {
  private server: Server | null = null;
  private port: number = 0;
  private readonly host: string = "127.0.0.1";
  private readonly routes: Map<string, RouteHandler> = new Map();
  private defaultHandler?: RouteHandler;
  private readonly connections: Set<any> = new Set();

  constructor(options: TestServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? this.getRandomPort();
  }

  /**
   * Get a random port between 40000 and 50000.
   */
  private getRandomPort(): number {
    return Math.floor(Math.random() * 10000) + 40000;
  }

  /**
   * Add a route handler.
   */
  route(path: string, handler: RouteHandler): this {
    this.routes.set(path, handler);
    return this;
  }

  /**
   * Add a route that returns a specific response.
   */
  respond(path: string, config: ResponseConfig): this {
    this.routes.set(path, async (req, res) => {
      if (config.delay) {
        await new Promise((resolve) => setTimeout(resolve, config.delay));
      }

      if (config.error) {
        req.socket.destroy();
        return;
      }

      const status = config.status ?? 200;
      const headers = {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
        ...config.headers,
      };

      res.writeHead(status, headers);

      if (config.body instanceof Buffer) {
        res.end(config.body);
      } else if (typeof config.body === "string") {
        res.end(config.body);
      } else if (config.body && typeof (config.body as any).pipe === "function") {
        (config.body as NodeJS.ReadableStream).pipe(res);
      } else {
        res.end();
      }
    });
    return this;
  }

  /**
   * Add CSV response.
   */
  respondWithCSV(path: string, csvData: string, options: Partial<ResponseConfig> = {}): this {
    return this.respond(path, {
      ...options,
      body: csvData,
      headers: {
        "Content-Type": "text/csv",
        "Content-Length": String(Buffer.byteLength(csvData)),
        ...options.headers,
      },
    });
  }

  /**
   * Add JSON response.
   */
  respondWithJSON(path: string, jsonData: any, options: Partial<ResponseConfig> = {}): this {
    const jsonString = JSON.stringify(jsonData);
    return this.respond(path, {
      ...options,
      body: jsonString,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(jsonString)),
        ...options.headers,
      },
    });
  }

  /**
   * Add file response from fixtures.
   */
  respondWithFile(routePath: string, fixturePath: string, contentType: string): this {
    const fullPath = path.join(__dirname, "../fixtures", fixturePath);
    this.routes.set(routePath, (_req, res) => {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      });
      createReadStream(fullPath).pipe(res);
    });
    return this;
  }

  /**
   * Add authentication-protected route.
   */
  respondWithAuth(
    path: string,
    authType: "bearer" | "basic" | "api-key",
    credentials: any,
    successResponse: ResponseConfig,
    failureResponse?: ResponseConfig
  ): this {
    this.routes.set(path, async (req, res) => {
      let authorized = false;

      switch (authType) {
        case "bearer":
          authorized = req.headers.authorization === `Bearer ${credentials.token}`;
          break;
        case "basic": {
          const userPass = `${credentials.username}:${credentials.password}`;
          const expectedAuth = `Basic ${Buffer.from(userPass).toString("base64")}`;
          authorized = req.headers.authorization === expectedAuth;
          break;
        }
        case "api-key":
          authorized = req.headers[credentials.header.toLowerCase()] === credentials.key;
          break;
      }

      const config = authorized
        ? successResponse
        : (failureResponse ?? {
            status: 401,
            body: "Unauthorized",
            headers: { "Content-Type": "text/plain" },
          });

      if (config.delay) {
        await new Promise((resolve) => setTimeout(resolve, config.delay));
      }

      res.writeHead(config.status ?? (authorized ? 200 : 401), config.headers ?? {});
      res.end(config.body ?? "");
    });
    return this;
  }

  /**
   * Add rate-limited route.
   */
  respondWithRateLimit(path: string, maxRequests: number, windowMs: number, successResponse: ResponseConfig): this {
    const requests = new Map<string, { count: number; resetTime: number }>();

    this.routes.set(path, async (req, res) => {
      const clientId = req.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const clientData = requests.get(clientId);

      if (!clientData || now > clientData.resetTime) {
        requests.set(clientId, { count: 1, resetTime: now + windowMs });
      } else if (clientData.count >= maxRequests) {
        res.writeHead(429, {
          "Content-Type": "text/plain",
          "Retry-After": String(Math.ceil((clientData.resetTime - now) / 1000)),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
        });
        res.end("Too Many Requests");
        return;
      } else {
        clientData.count++;
      }

      // Return success response
      if (successResponse.delay) {
        await new Promise((resolve) => setTimeout(resolve, successResponse.delay));
      }
      res.writeHead(successResponse.status ?? 200, successResponse.headers ?? {});
      res.end(successResponse.body ?? "");
    });
    return this;
  }

  /**
   * Add streaming response.
   */
  respondWithStream(path: string, chunks: Array<string | Buffer>, chunkDelayMs: number = 100): this {
    this.routes.set(path, async (_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Transfer-Encoding": "chunked",
      });

      for (const chunk of chunks) {
        res.write(chunk);
        await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
      }
      res.end();
    });
    return this;
  }

  /**
   * Set default handler for unmatched routes.
   */
  setDefaultHandler(handler: RouteHandler): this {
    this.defaultHandler = handler;
    return this;
  }

  /**
   * Start the server.
   */
  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        const handler = this.routes.get(req.url ?? "") ?? this.defaultHandler;
        if (handler) {
          // Handle async handler properly without returning promise
          void (async () => {
            try {
              await handler(req, res);
            } catch (err) {
              console.error("Handler error:", err);
              if (!res.headersSent) {
                res.writeHead(500);
                res.end("Internal Server Error");
              }
            }
          })();
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      });

      // Track connections for proper cleanup
      this.server.on("connection", (socket) => {
        this.connections.add(socket);
        socket.on("close", () => {
          this.connections.delete(socket);
        });
      });

      this.server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          // Try another random port if the current one is in use
          this.port = this.getRandomPort();
          this.server?.close();
          // Handle async restart without returning promise
          void (async () => {
            try {
              const url = await this.start();
              resolve(url);
            } catch (error) {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          })();
        } else {
          reject(new Error(err.message ?? "Server error"));
        }
      });

      this.server.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}`;
        resolve(url);
      });
    });
  }

  /**
   * Stop the server.
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        // Force close all active connections
        for (const socket of this.connections) {
          socket.destroy();
        }
        this.connections.clear();

        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the server URL.
   */
  get url(): string {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Get URL for a specific path.
   */
  getUrl(path: string): string {
    return `${this.url}${path}`;
  }
}

/**
 * Create a simple test server with a single response.
 */
export const createSimpleTestServer = async (
  response: ResponseConfig
): Promise<{ server: TestServer; url: string; stop: () => Promise<void> }> => {
  const server = new TestServer();
  server.setDefaultHandler((_req, res) => {
    res.writeHead(response.status ?? 200, response.headers ?? {});
    res.end(response.body ?? "");
  });
  const url = await server.start();
  return {
    server,
    url,
    stop: () => server.stop(),
  };
};

/**
 * Create a test server that simulates network errors.
 */
export const createErrorTestServer = (): TestServer =>
  new TestServer()
    .respond("/timeout", { delay: 60000 }) // 60 second delay
    .respond("/connection-reset", { error: true })
    .respond("/500", { status: 500, body: "Internal Server Error" })
    .respond("/404", { status: 404, body: "Not Found" });

/**
 * Create a test server with common CSV endpoints.
 */
export const createCSVTestServer = (): TestServer => {
  const server = new TestServer();

  // Common CSV responses
  server
    .respondWithCSV("/simple.csv", "id,name,value\n1,test,100")
    .respondWithCSV("/empty.csv", "")
    .respondWithCSV("/headers-only.csv", "id,name,value")
    .respondWithCSV("/large.csv", Array.from({ length: 10000 }, (_, i) => `${i},Item ${i},${i * 100}`).join("\n"));

  return server;
};
