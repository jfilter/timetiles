/// <reference types="jest" />
import "@types/jest";

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

export {};
