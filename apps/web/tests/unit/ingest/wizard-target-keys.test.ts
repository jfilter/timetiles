/**
 * Unit tests for the wizard column-table target keys.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { TARGET_OPTIONS } from "@/app/[locale]/(frontend)/ingest/_components/steps/column-mapping-shared";
import { WIZARD_TARGET_KEYS } from "@/lib/ingest/column-view";

describe("WIZARD_TARGET_KEYS", () => {
  it("matches the target options the column table offers", () => {
    const offered = TARGET_OPTIONS.map((o) => o.value).filter((v) => v !== "__none__");
    expect(new Set(WIZARD_TARGET_KEYS)).toEqual(new Set(offered));
  });
});
