/**
 * Both locales must define the same message keys.
 *
 * The English-constants round added keys in two files by hand; a key added to `en` only
 * renders its own name under `/de`, which is exactly the class of bug that round fixed.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it } from "vitest";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

type MessageTree = { [key: string]: string | MessageTree };

const flatten = (tree: MessageTree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`)
  );

describe("message catalogs", () => {
  const enKeys = flatten(en);
  const deKeys = flatten(de);

  it("defines every English key in German", () => {
    expect(enKeys.filter((key) => !deKeys.includes(key))).toEqual([]);
  });

  it("defines no German key that English lacks", () => {
    expect(deKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });
});
