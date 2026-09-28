import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readmeTemplate } from "../../../packages/scraper/src/cli/templates/readme.js";
import { OutputWriter } from "../../../packages/scraper/src/output.js";
import { countCsvDataRows } from "../src/lib/csv.js";

// The Node SDK has no test runner of its own; its output is checked against the runner's CSV reading here.
describe("Node scraper SDK", () => {
  it("writes CRLF records like the Python SDK", () => {
    const writer = new OutputWriter("/unused");
    writer.writeRows([{ title: "A, B", date: "2026-01-01" }, { title: 'say "hi"' }]);

    expect(writer.toCsvString()).toBe('title,date\r\n"A, B",2026-01-01\r\n"say ""hi""",\r\n');
  });

  it("does not count a single-column row with an empty value, which the import skips", () => {
    const writer = new OutputWriter("/unused");
    writer.writeRows([{ title: "first" }, { title: "" }, { title: "third" }]);

    const csv = writer.toCsvString();

    expect(csv).toBe('title\r\nfirst\r\n""\r\nthird\r\n');
    expect(countCsvDataRows(csv)).toBe(2);
  });

  it("reports as many rows as the writer collected when a value is only whitespace", () => {
    const writer = new OutputWriter("/unused");
    writer.writeRows([{ title: "first" }, { title: " " }, { title: "third" }]);

    expect(countCsvDataRows(writer.toCsvString())).toBe(writer.rowCount);
  });

  it("refuses rows without any field instead of saving an empty file", () => {
    const writer = new OutputWriter("/unused");
    writer.writeRows([{}, {}]);

    expect(() => writer.toCsvString()).toThrow("2 rows but none has a field");
  });

  it("still writes an empty file when no row was collected", () => {
    expect(new OutputWriter("/unused").toCsvString()).toBe("");
  });

  it("numbers the README getting-started steps without gaps", () => {
    for (const runtime of ["python", "node"]) {
      const readme = readmeTemplate({ name: "demo", runtime, entrypoint: "scraper.py" });
      const numbers = [...readme.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1]));

      expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    }
  });

  const runInit = (args: string[]): { status: number | null; created: (name: string) => boolean } => {
    const cwd = mkdtempSync(join(tmpdir(), "scraper-init-"));
    try {
      const cli = new URL("../../../packages/scraper/src/cli/init.ts", import.meta.url).pathname;
      const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), cli, "init", ...args], {
        cwd,
      });
      const created = new Set(readdirSync(cwd));
      return { status: result.status, created: (name) => created.has(name) };
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };

  it.each([
    ["my-scraper", 0],
    ["a1", 0],
    ["My-Scraper", 1],
    ["my--scraper", 1],
    ["-scraper", 1],
    ["scraper-", 1],
  ])("scaffolds a project named %s only when the name is kebab-case", (name, status) => {
    const result = runInit([name]);

    expect(result.status).toBe(status);
    expect(result.created(name)).toBe(status === 0);
  });

  it("refuses an option it does not know instead of scaffolding with defaults", () => {
    const result = runInit(["my-scraper", "--runtme", "node"]);

    expect(result.status).toBe(1);
    expect(result.created("my-scraper")).toBe(false);
  });
});
