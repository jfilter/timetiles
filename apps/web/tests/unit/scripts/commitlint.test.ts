// @vitest-environment node
/**
 * Commit subject validation must reject vague words, not precise words that
 * happen to contain them.
 *
 * @module
 * @category Tests
 */
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const configPath = resolve(process.cwd(), "../../commitlint.config.mjs");
const { default: config } = (await import(configPath)) as {
  default: { plugins: Array<{ rules: Record<string, (parsed: { subject?: string }) => [boolean, string?]> }> };
};
const validateSubject = config.plugins[0]!.rules["no-vague-subjects"]!;

describe("commit subject wording", () => {
  it.each(["stuff", "things", "updates", "changes", "fixes"])("rejects the vague word %s", (word) => {
    expect(validateSubject({ subject: `apply ${word}` })[0]).toBe(false);
    expect(validateSubject({ subject: `apply (${word.toUpperCase()})` })[0]).toBe(false);
  });

  it.each(["remove unsafe autofixes", "validate token exchanges", "preserve prefixes", "prevent credential stuffing"])(
    "accepts precise wording: %s",
    (subject) => {
      expect(validateSubject({ subject })[0]).toBe(true);
    }
  );

  it("leaves missing subjects to the subject-empty rule", () => {
    expect(validateSubject({})[0]).toBe(true);
  });
});
