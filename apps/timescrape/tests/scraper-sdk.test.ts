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

  it("keeps a single-column row with an empty value as a counted record", () => {
    const writer = new OutputWriter("/unused");
    writer.writeRows([{ title: "first" }, { title: "" }, { title: "third" }]);

    const csv = writer.toCsvString();

    expect(csv).toBe('title\r\nfirst\r\n""\r\nthird\r\n');
    expect(countCsvDataRows(csv)).toBe(3);
  });

  it("numbers the README getting-started steps without gaps", () => {
    for (const runtime of ["python", "node"]) {
      const readme = readmeTemplate({ name: "demo", runtime, entrypoint: "scraper.py" });
      const numbers = [...readme.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1]));

      expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    }
  });
});
