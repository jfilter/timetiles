import { describe, it, expect } from "vitest";
import { createIsolatedTestEnvironment } from "./test-helpers";

describe("Simple Test", () => {
  it("should complete and exit cleanly", async () => {
    const testEnv = await createIsolatedTestEnvironment();

    try {
      expect(testEnv.payload).toBeDefined();
      expect(testEnv.seedManager).toBeDefined();
      expect(true).toBe(true);
    } finally {
      await testEnv.cleanup();
    }
  });
});
