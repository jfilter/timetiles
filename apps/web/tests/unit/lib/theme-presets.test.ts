/**
 * Tests for the theme script executed before hydration.
 *
 * @module
 * @category Tests
 */
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { THEME_PRESET_INIT_SCRIPT, THEME_PRESET_STORAGE_KEY } from "@/lib/constants/theme-presets";

describe("theme preset initialization", () => {
  it.each([null, "", "cartographic", "unknown", "modern extra", "modern"])(
    "only applies a known non-default preset: %s",
    (stored) => {
      const html = { classList: { add: vi.fn() } };
      const body = { classList: { add: vi.fn() } };
      const getItem = vi.fn(() => stored);

      // Execute only our static application script, never user-provided code.
      // eslint-disable-next-line sonarjs/code-eval
      runInNewContext(THEME_PRESET_INIT_SCRIPT, {
        localStorage: { getItem },
        document: { documentElement: html, body },
      });

      expect(getItem).toHaveBeenCalledWith(THEME_PRESET_STORAGE_KEY);
      for (const element of [html, body]) {
        if (stored === "modern") {
          expect(element.classList.add).toHaveBeenCalledExactlyOnceWith("theme-modern");
        } else {
          expect(element.classList.add).not.toHaveBeenCalled();
        }
      }
    }
  );

  it("tolerates unavailable browser storage", () => {
    // eslint-disable-next-line sonarjs/code-eval -- Executes the static application script only.
    expect(() => runInNewContext(THEME_PRESET_INIT_SCRIPT, {})).not.toThrow();
  });
});
