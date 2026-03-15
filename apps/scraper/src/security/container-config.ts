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

export function buildPodmanArgs(config: ContainerConfig): string[] {
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
    `-v=${outputDir}:/output:rw,Z`,

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

  // Environment variables
  for (const [key, value] of Object.entries(env)) {
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
}
