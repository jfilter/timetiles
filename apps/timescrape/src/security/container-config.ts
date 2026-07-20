/**
 * Build Podman container flags for hardened scraper execution.
 *
 * @module
 * @category Security
 */

import { resolve } from "node:path";

const SECCOMP_PROFILE_PATH = resolve(import.meta.dirname, "seccomp-profile.json");

export interface ContainerLimits {
  timeoutSecs: number;
  memoryMb: number;
  cpus?: number;
  pidsLimit?: number;
}

export interface ContainerConfig {
  runId: string;
  runtime: string;
  entrypoint: string;
  codeDir: string;
  outputDir: string;
  env: Record<string, string>;
  limits: ContainerLimits;
}

export const buildPodmanArgs = (config: ContainerConfig): string[] => {
  const { runId, runtime, entrypoint, codeDir, outputDir, env, limits } = config;

  const args: string[] = [
    "run",
    "--rm",
    `--name=run-${runId}`,

    // Resource limits
    `--memory=${limits.memoryMb}m`,
    `--cpus=${limits.cpus ?? 1}`,
    `--pids-limit=${limits.pidsLimit ?? 256}`,
    `--stop-timeout=${limits.timeoutSecs}`,

    // Filesystem isolation
    "--read-only",
    "--tmpfs=/tmp:rw,size=64m,noexec",
    `-v=${codeDir}:/scraper:ro,Z`,
    // `U` chowns the mount to the container's mapped uid. Without it the
    // container -- which runs as uid 1000, mapped into an unprivileged subuid
    // range -- cannot write to a directory owned by the runner's own uid, and
    // every scraper fails with EACCES on its output file. The runner reads the
    // result back through the file's mode bits and removes the tree via
    // `podman unshare`, which is the only part that needs the mapping undone.
    //
    // This requires the directory's owner and group to fall inside the runner
    // user's id mapping. They do -- the unit runs as User/Group=timetiles and
    // the runner creates the directory itself -- but running the runner under
    // a primary group it does not own would make the chown fail with EPERM.
    `-v=${outputDir}:/output:rw,Z,U`,

    // Security hardening
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    `--security-opt=seccomp=${SECCOMP_PROFILE_PATH}`,
    "--userns=auto",

    // Network isolation
    "--network=scraper-sandbox",
    "--dns=1.1.1.1",
    "--dns=1.0.0.1",
  ];

  // Environment variables — validate key names and skip reserved keys
  const ENV_KEY_PATTERN = /^[A-Za-z_]\w*$/;
  const RESERVED_ENV_KEYS = new Set([
    "PATH",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "HOME",
    "USER",
    "SHELL",
    "TIMESCRAPE_OUTPUT_DIR",
  ]);

  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_PATTERN.test(key)) continue; // skip invalid keys
    if (RESERVED_ENV_KEYS.has(key)) continue; // skip reserved keys
    args.push(`-e=${key}=${value}`);
  }

  // Output file path env var for helper libraries
  args.push("-e=TIMESCRAPE_OUTPUT_DIR=/output");

  // Image and command
  const image = `timescrape-${runtime}`;
  args.push(image);

  // Entrypoint command based on runtime
  if (runtime === "python") {
    args.push("python", `/scraper/${entrypoint}`);
  } else if (runtime === "node") {
    args.push("node", `/scraper/${entrypoint}`);
  }

  return args;
};
