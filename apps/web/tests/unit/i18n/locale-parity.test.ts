/**
 * Verifies that all locale message files have identical key structures.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it } from "vitest";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

const getKeys = (obj: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null ? getKeys(value as Record<string, unknown>, path) : [path];
  });

describe("i18n locale parity", () => {
  it("en and de have the same translation keys", () => {
    const enKeys = getKeys(en).sort((a, b) => a.localeCompare(b));
    const deKeys = getKeys(de).sort((a, b) => a.localeCompare(b));
    expect(deKeys).toEqual(enKeys);
  });

  it("no translation values are empty strings", () => {
    const checkEmpty = (obj: Record<string, unknown>, locale: string, prefix = "") => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") {
          expect(value.trim(), `${locale}:${path} is empty`).not.toBe("");
        } else if (typeof value === "object" && value !== null) {
          checkEmpty(value as Record<string, unknown>, locale, path);
        }
      }
    };

    checkEmpty(en, "en");
    checkEmpty(de, "de");
  });
});
