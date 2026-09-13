/**
 * Type tests: the chart prop types exported from the charts entry are the components' own.
 *
 * @module
 */
import type { ComponentProps } from "react";
import { describe, expectTypeOf, it } from "vitest";

import type { BarChart, BarChartProps, TimeHistogram, TimeHistogramProps } from "../../src/components/charts";

describe("charts entry prop types", () => {
  it("exports the TimeHistogram component props", () => {
    expectTypeOf<TimeHistogramProps>().toEqualTypeOf<ComponentProps<typeof TimeHistogram>>();
  });

  it("exports the BarChart component props", () => {
    expectTypeOf<BarChartProps>().toEqualTypeOf<ComponentProps<typeof BarChart>>();
  });
});
