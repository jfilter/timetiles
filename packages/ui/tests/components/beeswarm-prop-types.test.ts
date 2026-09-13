/**
 * Type tests: BeeswarmChart exposes only props it actually reads.
 *
 * @module
 */
import { describe, expectTypeOf, it } from "vitest";

import type { BeeswarmChartProps } from "../../src/components/charts";

describe("BeeswarmChartProps", () => {
  it("has no unread count props", () => {
    expectTypeOf<BeeswarmChartProps>().not.toHaveProperty("totalCount");
    expectTypeOf<BeeswarmChartProps>().not.toHaveProperty("visibleCount");
  });
});
