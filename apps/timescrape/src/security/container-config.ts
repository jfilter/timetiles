/**
 * Build Podman container flags for hardened scraper execution.
 *
 * @module
 * @category Security
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

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
    "TIMESCRAPE_OUTPUT_FILE",
  ]);

  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_PATTERN.test(key)) continue; // skip invalid keys
    if (RESERVED_ENV_KEYS.has(key)) continue; // skip reserved keys
    args.push(`-e=${key}=${value}`);
  }

  // Output location env vars for helper libraries. The filename must travel
  // with the directory: the runner reads back the manifest's configured
  // `output:` name, so an SDK that only knew the directory always wrote
  // data.csv and any other configured name failed the run.
  args.push("-e=TIMESCRAPE_OUTPUT_DIR=/output");
  args.push(`-e=TIMESCRAPE_OUTPUT_FILE=${outputFile ?? "data.csv"}`);

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
