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
