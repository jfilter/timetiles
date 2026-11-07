/**
 * Smart-HTTP git server on loopback for clone tests, backed by `git http-backend`.
 *
 * @module
 * @category Tests
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface GitHttpServer {
  /** Clone URL of the served repository on 127.0.0.1. */
  url: string;
  port: number;
  /** Requests the server answered. */
  hits: () => number;
  close: () => Promise<void>;
}

const git = (cwd: string, args: string[]): void => {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.org", ...args], { cwd, stdio: "ignore" });
};

/** Serve a one-commit repository holding `files` (path to content). */
export const startGitHttpServer = async (files: Record<string, string | Buffer>): Promise<GitHttpServer> => {
  const root = mkdtempSync(join(tmpdir(), "git-http-"));
  const work = join(root, "work");
  mkdirSync(work);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), content);
  }
  git(work, ["init", "-q", "-b", "main"]);
  git(work, ["add", "-A"]);
  git(work, ["commit", "-q", "-m", "fixture"]);
  git(root, ["clone", "-q", "--bare", work, "r.git"]);

  let hits = 0;
  const server: Server = createServer((req, res) => {
    hits++;
    const [path = "", query = ""] = (req.url ?? "").split("?");
    const backend = spawn("git", ["http-backend"], {
      env: {
        PATH: process.env.PATH,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: "1",
        PATH_INFO: path,
        QUERY_STRING: query,
        REQUEST_METHOD: req.method,
        CONTENT_TYPE: req.headers["content-type"] ?? "",
        HTTP_CONTENT_ENCODING: req.headers["content-encoding"] ?? "",
        GIT_PROTOCOL: req.headers["git-protocol"] ?? "",
      },
    });
    req.pipe(backend.stdin);

    // CGI output: headers, a blank line, then the body.
    let head = Buffer.alloc(0);
    let headersDone = false;
    backend.stdout.on("data", (chunk: Buffer) => {
      if (headersDone) {
        res.write(chunk);
        return;
      }
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf("\r\n\r\n");
      if (end === -1) return;
      headersDone = true;
      let status = 200;
      for (const line of head.subarray(0, end).toString().split("\r\n")) {
        const [name = "", ...rest] = line.split(":");
        const value = rest.join(":").trim();
        if (name.toLowerCase() === "status") status = Number.parseInt(value, 10);
        else res.setHeader(name, value);
      }
      res.writeHead(status);
      res.write(head.subarray(end + 4));
    });
    backend.stdout.on("end", () => res.end());
    res.on("close", () => backend.kill());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/r.git`,
    port,
    hits: () => hits,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      rmSync(root, { recursive: true, force: true });
    },
  };
};
