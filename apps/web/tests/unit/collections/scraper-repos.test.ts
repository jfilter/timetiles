/**
 * Unit tests for scraper repo collection validation.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it } from "vitest";

import ScraperRepos from "@/lib/collections/scraper-repos";

const gitUrlField = ScraperRepos.fields.find((field) => "name" in field && field.name === "gitUrl") as
  | { validate?: (value: unknown, options: { data: Record<string, unknown> }) => string | true }
  | undefined;

const validateGitUrl = (value: unknown): string | true => {
  if (!gitUrlField?.validate) {
    throw new Error("gitUrl field validation is not configured");
  }

  return gitUrlField.validate(value, { data: { sourceType: "git" } });
};

const codeField = ScraperRepos.fields.find((field) => "name" in field && field.name === "code") as
  | { validate?: (value: unknown, options: { data: Record<string, unknown> }) => string | true }
  | undefined;

const validateCode = (value: unknown): string | true => {
  if (!codeField?.validate) {
    throw new Error("code field validation is not configured");
  }

  return codeField.validate(value, { data: { sourceType: "upload" } });
};

describe("ScraperRepos code validation", () => {
  it.each([[null], [undefined], [{ "scraper.py": "print(1)", "lib/util.py": "", "scrapers.yml": "scrapers: []" }]])(
    "accepts %j",
    (value) => {
      expect(validateCode(value)).toBe(true);
    }
  );

  it.each([
    ["an array", ["scraper.py"]],
    ["a string", '{"scraper.py": "x"}'],
    ["a non-string file body", { "scraper.py": { nested: true } }],
    ["a traversing path", { "../scraper.py": "x" }],
    ["an absolute path", { "/etc/passwd": "x" }],
    ["an empty path", { "": "x" }],
  ])("rejects %s", (_label, value) => {
    expect(validateCode(value)).toEqual(expect.any(String));
  });
});

describe("ScraperRepos gitUrl validation", () => {
  it("rejects embedded credentials", () => {
    expect(validateGitUrl("https://token@github.com/example/repo.git")).toBe(
      "Git URLs must not include embedded credentials"
    );
  });

  it("accepts standard HTTPS git URLs", () => {
    expect(validateGitUrl("https://github.com/example/repo.git")).toBe(true);
  });
});
