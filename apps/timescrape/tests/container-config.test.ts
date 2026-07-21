import { describe, expect, it } from "vitest";

import { buildPodmanArgs, CONTAINER_STOP_GRACE_SECS } from "../src/security/container-config.js";

describe("buildPodmanArgs", () => {
  const baseConfig = {
    runId: "test-123",
    runtime: "python" as const,
    entrypoint: "scraper.py",
    codeDir: "/tmp/code",
    outputDir: "/tmp/output",
    env: {},
    limits: { timeoutSecs: 300, memoryMb: 512 },
  };

  it("includes hardening flags", () => {
    const args = buildPodmanArgs(baseConfig);

    expect(args).toContain("--cap-drop=ALL");
    expect(args).toContain("--security-opt=no-new-privileges");
    expect(args).toContain("--read-only");
    expect(args).toContain("--userns=auto");
    expect(args).toContain("--network=scraper-sandbox");
  });

  it("sets resource limits", () => {
    const args = buildPodmanArgs(baseConfig);

    expect(args).toContain("--memory=512m");
    expect(args).toContain("--cpus=1");
    expect(args).toContain("--pids-limit=256");
  });

  it("keeps the stop grace period small and independent of the run timeout", () => {
    // --stop-timeout is the SIGTERM->SIGKILL grace, not a run budget. Deriving
    // it from timeoutSecs (up to 3600s) made every `podman stop` outlast the
    // runner's own client timeouts, so a timed-out container was never killed.
    const args = buildPodmanArgs(baseConfig);

    expect(args).toContain(`--stop-timeout=${CONTAINER_STOP_GRACE_SECS}`);
    expect(args).not.toContain("--stop-timeout=300");
    expect(CONTAINER_STOP_GRACE_SECS).toBeLessThanOrEqual(30);
  });

  it("mounts code as read-only and output as read-write", () => {
    const args = buildPodmanArgs(baseConfig);

    expect(args).toContain("-v=/tmp/code:/scraper:ro,Z");
    expect(args).toContain("-v=/tmp/output:/output:rw,Z,U");
  });

  it("chowns the output mount into the container's uid range", () => {
    // Without `U` the container runs as a mapped subuid that cannot write to a
    // directory owned by the runner, and every scraper dies with EACCES on its
    // output file. Asserted separately from the mount test above because the
    // failure it guards against is silent at build time and only shows up when
    // a real container runs.
    const args = buildPodmanArgs(baseConfig);

    expect(args.find((a) => a.startsWith("-v=/tmp/output:"))).toBe("-v=/tmp/output:/output:rw,Z,U");
  });

  it("adds environment variables", () => {
    const args = buildPodmanArgs({ ...baseConfig, env: { API_KEY: "secret" } });

    expect(args).toContain("-e=API_KEY=secret");
    expect(args).toContain("-e=TIMESCRAPE_OUTPUT_DIR=/output");
  });

  it("passes the configured output filename to the container", () => {
    // The runner reads back the manifest's `output:` name. Without telling the
    // container about it, the SDK always wrote data.csv and any manifest
    // declaring another name failed with "no output file produced".
    const args = buildPodmanArgs({ ...baseConfig, outputFile: "events.csv" });

    expect(args).toContain("-e=TIMESCRAPE_OUTPUT_FILE=events.csv");
  });

  it("defaults the output filename to data.csv", () => {
    const args = buildPodmanArgs(baseConfig);

    expect(args).toContain("-e=TIMESCRAPE_OUTPUT_FILE=data.csv");
  });

  it("does not let scraper env override the output location", () => {
    const args = buildPodmanArgs({
      ...baseConfig,
      outputFile: "events.csv",
      env: { TIMESCRAPE_OUTPUT_FILE: "/etc/passwd", TIMESCRAPE_OUTPUT_DIR: "/etc" },
    });

    expect(args).toContain("-e=TIMESCRAPE_OUTPUT_FILE=events.csv");
    expect(args).toContain("-e=TIMESCRAPE_OUTPUT_DIR=/output");
    expect(args).not.toContain("-e=TIMESCRAPE_OUTPUT_FILE=/etc/passwd");
    expect(args).not.toContain("-e=TIMESCRAPE_OUTPUT_DIR=/etc");
  });

  it("uses correct image and command for python", () => {
    const args = buildPodmanArgs(baseConfig);

    expect(args).toContain("timescrape-python");
    expect(args).toContain("python");
    expect(args).toContain("/scraper/scraper.py");
  });

  it("uses correct image and command for node", () => {
    const args = buildPodmanArgs({ ...baseConfig, runtime: "node", entrypoint: "scraper.js" });

    expect(args).toContain("timescrape-node");
    expect(args).toContain("node");
    expect(args).toContain("/scraper/scraper.js");
  });

  it("includes tmpfs with noexec", () => {
    const args = buildPodmanArgs(baseConfig);

    expect(args).toContain("--tmpfs=/tmp:rw,size=64m,noexec");
  });

  it("sets DNS to external-only", () => {
    const args = buildPodmanArgs(baseConfig);

    expect(args).toContain("--dns=1.1.1.1");
    expect(args).toContain("--dns=1.0.0.1");
  });

  it("includes seccomp profile", () => {
    const args = buildPodmanArgs(baseConfig);

    const seccompArg = args.find((a) => a.startsWith("--security-opt=seccomp="));
    expect(seccompArg).toBeDefined();
    expect(seccompArg).toContain("seccomp-profile.json");
  });
});
