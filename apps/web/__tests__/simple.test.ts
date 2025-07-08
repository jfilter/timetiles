import { createSeedManager } from "../lib/seed/index";

describe("Simple Test", () => {
  it("should complete and exit cleanly", async () => {
    const seedManager = createSeedManager();

    try {
      await seedManager.initialize();
      expect(true).toBe(true);
    } finally {
      await seedManager.cleanup();
    }
  });
});
