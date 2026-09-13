/**
 * Build Podman container flags for hardened scraper execution.
 *
 * @module
 * @category Security
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { ScraperRuntime } from "@timetiles/shared";
import { ENV_KEY_PATTERN, isReservedScraperEnvKey, SCRAPER_DEFAULT_OUTPUT_FILE } from "@timetiles/shared";

import { RunnerError } from "../lib/errors.js";

const SECCOMP_PROFILE_PATH = resolve(import.meta.dirname, "seccomp-profile.json");

/**
 * Fail at startup if the seccomp profile did not ship next to the bundle.
 *
 * The path is resolved against `import.meta.dirname`, which is `src/security/`
 * when running from source but `dist/` once tsup has flattened the entry point.
 * A packaging change that puts the profile anywhere else leaves podman to
 * discover it, per run, as `opening seccomp profile failed: ... no such file` —
 * an exit 125 attributed to the scraper rather than to the deployment.
 *
 * Checked here instead of in a unit test because no test running from source
 * can see a packaging mistake: the file is always present in `src/`. Failing at
 * startup makes the deployment's "runner service is active" check catch it.
 */
export const assertSecurityAssets = (): void => {
  if (!existsSync(SECCOMP_PROFILE_PATH)) {
    throw new Error(
      `Seccomp profile missing at ${SECCOMP_PROFILE_PATH}. ` +
        `It must be packaged next to the bundle; see the build script and Dockerfile.`
    );
  }
};

/**
 * Grace period podman waits between SIGTERM and SIGKILL when stopping a run.
 *
 * This is deliberately a small fixed value and NOT the run's own timeout.
 * `--stop-timeout` is the shutdown grace period, not a run budget: setting it
 * to `timeoutSecs` (up to 3600s via the API's `timeout_secs` max) meant every
 * `podman stop` for a timed-out container waited up to an hour for SIGTERM to
 * be honoured. The runner's own client timeouts are far shorter, so they killed
 * the podman *client* first and left the container running — the timeout could
 * never actually terminate anything. Callers must size their client timeout
 * above this value; see `forceKillContainer` in services/runner.ts.
 */
export const CONTAINER_STOP_GRACE_SECS = 10;

/** Added to the run timeout for podman's own `--timeout`, which ends containers a restarted runner orphaned. */
export const CONTAINER_RUN_TIMEOUT_GRACE_SECS = 60;

export const SCRAPER_SANDBOX_NETWORK = "scraper-sandbox";

export const scraperImage = (runtime: ScraperRuntime): string => `timescrape-${runtime}`;

export interface ContainerLimits {
  timeoutSecs: number;
  memoryMb: number;
  cpus?: number;
  pidsLimit?: number;
}

export interface ContainerConfig {
  runId: string;
  runtime: ScraperRuntime;
  entrypoint: string;
  codeDir: string;
  outputDir: string;
  /** Filename the manifest declared via `output:`. Defaults to data.csv. */
  outputFile?: string;
  env: Record<string, string>;
  limits: ContainerLimits;
}

export const buildPodmanArgs = (config: ContainerConfig): string[] => {
  const { runId, runtime, entrypoint, codeDir, outputDir, outputFile, env, limits } = config;

  const args: string[] = [
    "run",
    "--rm",
    `--name=run-${runId}`,

    // Resource limits
    `--memory=${limits.memoryMb}m`,
    `--cpus=${limits.cpus ?? 1}`,
    `--pids-limit=${limits.pidsLimit ?? 256}`,
    `--stop-timeout=${CONTAINER_STOP_GRACE_SECS}`,
    `--timeout=${limits.timeoutSecs + CONTAINER_RUN_TIMEOUT_GRACE_SECS}`,

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
    //
    // SIZE: a bind mount carries no kernel-level quota, and podman's
    // `--storage-opt size=` applies only to the container's own writable layer,
    // never to a bind. A scraper can therefore write until the runner host's
    // disk is full. SCRAPER_MAX_OUTPUT_SIZE_MB alone cannot prevent that: it is
    // read in `collectOutput`, AFTER the container has exited and the bytes are
    // already on disk. The runner enforces the cap while the run is in flight
    // with the output watchdog in services/runner.ts, which kills the container
    // on breach. The watchdog samples, so it bounds the write at roughly the
    // cap rather than exactly; a hard bound needs SCRAPER_DATA_DIR to sit on a
    // size-limited filesystem, which is a host-provisioning concern.
    `-v=${outputDir}:/output:rw,Z,U`,

    // Security hardening
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    `--security-opt=seccomp=${SECCOMP_PROFILE_PATH}`,
    "--userns=auto",

    // Network isolation
    `--network=${SCRAPER_SANDBOX_NETWORK}`,
    "--dns=1.1.1.1",
    "--dns=1.0.0.1",
  ];

  // The web app enforces the same rules at save time, so a rejected key is a malformed request.
  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_PATTERN.test(key) || isReservedScraperEnvKey(key)) {
      throw new RunnerError(`Environment variable ${key} is invalid or reserved`, "INVALID_REQUEST", 400);
    }
    args.push(`-e=${key}=${value}`);
  }

  // Output location env vars for helper libraries. The filename must travel
  // with the directory: the runner reads back the manifest's configured
  // `output:` name, so an SDK that only knew the directory always wrote
  // data.csv and any other configured name failed the run.
  args.push("-e=TIMESCRAPE_OUTPUT_DIR=/output");
  args.push(`-e=TIMESCRAPE_OUTPUT_FILE=${outputFile ?? SCRAPER_DEFAULT_OUTPUT_FILE}`);

  // Image and command
  args.push(scraperImage(runtime));

  // Entrypoint command based on runtime
  if (runtime === "python") {
    args.push("python", `/scraper/${entrypoint}`);
  } else if (runtime === "node") {
    args.push("node", `/scraper/${entrypoint}`);
  }

  return args;
};
