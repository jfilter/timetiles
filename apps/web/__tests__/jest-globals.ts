// Jest globals setup
import * as jest from "jest";

// Make Jest globals available
declare global {
  var jest: typeof import("jest");
  var describe: typeof import("jest").describe;
  var it: typeof import("jest").it;
  var test: typeof import("jest").test;
  var expect: typeof import("jest").expect;
  var beforeAll: typeof import("jest").beforeAll;
  var beforeEach: typeof import("jest").beforeEach;
  var afterAll: typeof import("jest").afterAll;
  var afterEach: typeof import("jest").afterEach;
}

// This file ensures Jest globals are available
// Set up globals if they aren't already available
if (typeof global !== "undefined") {
  (global as any).jest = jest;
  (global as any).describe = describe;
  (global as any).it = it;
  (global as any).test = test;
  (global as any).expect = expect;
  (global as any).beforeAll = beforeAll;
  (global as any).beforeEach = beforeEach;
  (global as any).afterAll = afterAll;
  (global as any).afterEach = afterEach;
}
