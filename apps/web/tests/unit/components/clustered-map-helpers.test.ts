/**
 * Unit tests for the cluster/location count label MapLibre expressions.
 *
 * Regression for the bug where the "millions" branch divided the count by
 * 100000 (instead of 1000000) before appending "M", so a cluster of 1,000,000
 * events rendered as "10M". A minimal evaluator exercises the generated
 * `text-field` expression directly so the divisor cannot silently regress.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { buildClusterLabelLayerConfig, buildLocationLabelLayerConfig } from "@/components/maps/clustered-map-helpers";

// Minimal evaluator for the subset of MapLibre expression operators used by the
// label `text-field`. Mirrors MapLibre's runtime semantics for these ops.
const evalExpr = (expr: unknown, props: Record<string, number>): unknown => {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr as [string, ...unknown[]];
  switch (op) {
    case "get":
      return props[args[0] as string];
    case "literal":
      return args[0];
    case ">=":
      return (evalExpr(args[0], props) as number) >= (evalExpr(args[1], props) as number);
    case "/":
      return (evalExpr(args[0], props) as number) / (evalExpr(args[1], props) as number);
    case "round":
      return Math.round(evalExpr(args[0], props) as number);
    case "to-string":
      return String(evalExpr(args[0], props));
    case "concat":
      return args.map((a) => evalExpr(a, props)).join("");
    case "case": {
      for (let i = 0; i < args.length - 1; i += 2) {
        if (evalExpr(args[i], props)) return evalExpr(args[i + 1], props);
      }
      return evalExpr(args[args.length - 1], props);
    }
    default:
      throw new Error(`Unsupported expression op in label test: ${op}`);
  }
};

const labelFor = (textField: unknown, count: number): string => String(evalExpr(textField, { count }));

describe.each([
  ["buildClusterLabelLayerConfig", buildClusterLabelLayerConfig],
  ["buildLocationLabelLayerConfig", buildLocationLabelLayerConfig],
])("%s count label", (_name, build) => {
  const config = build(["==", ["get", "h3Cell"], "abc"]);
  const textField = (config.layout as { "text-field": unknown })["text-field"];

  it("renders raw counts below 1,000", () => {
    expect(labelFor(textField, 1)).toBe("1");
    expect(labelFor(textField, 999)).toBe("999");
  });

  it("renders thousands with a 'k' suffix", () => {
    expect(labelFor(textField, 1500)).toBe("1.5k");
    expect(labelFor(textField, 15000)).toBe("15k");
  });

  it("renders millions with a 'M' suffix using the correct 1,000,000 divisor", () => {
    // With the old bug (÷100000) these would render as "10M" / "25M".
    expect(labelFor(textField, 1_000_000)).toBe("1M");
    expect(labelFor(textField, 2_500_000)).toBe("3M"); // round(2.5) => 3 (away from zero)
    expect(labelFor(textField, 1_400_000)).toBe("1M");
  });
});
