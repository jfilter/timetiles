import { describe, expect, it } from "vitest";

import { buildPodmanArgs } from "../src/security/container-config.js";

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

  it("mounts code as read-only and output as read-write", () => {
    const args = buildPodmanArgs(baseConfig);

    expect(args).toContain("-v=/tmp/code:/scraper:ro,Z");
    expect(args).toContain("-v=/tmp/output:/output:rw,Z");
  });

  it("adds environment variables", () => {
    const args = buildPodmanArgs({ ...baseConfig, env: { API_KEY: "secret" } });

    expect(args).toContain("-e=API_KEY=secret");
    expect(args).toContain("-e=TIMESCRAPE_OUTPUT_DIR=/output");
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
