import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { createIsolatedTestEnvironment, createTestId } from "../../setup/test-helpers";

describe("Isolated Seed System Test Example", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clean up before each test - this is now isolated per test file
    await testEnv.seedManager.truncate();
  });

  describe("Isolated SeedManager", () => {
    it("should initialize properly in isolation", async () => {
      expect(testEnv.seedManager).toBeDefined();
      expect(testEnv.payload).toBeDefined();
    });

    it("should seed users collection in isolation", async () => {
      await testEnv.seedManager.seed({
        collections: ["users"],
        environment: "test",
        truncate: false,
      });

      const users = await testEnv.payload.find({
        collection: "users",
        limit: 100,
      });

      expect(users.docs.length).toBeGreaterThan(0);
      expect(
        users.docs.some((user: any) => user.email === "admin@example.com"),
      ).toBe(true);
    });

    it("should handle concurrent operations within same test file", async () => {
      // These operations can run concurrently because they're isolated
      const [catalogResult, userResult] = await Promise.all([
        testEnv.seedManager.seed({
          collections: ["catalogs"],
          environment: "test",
          truncate: false,
        }),
        testEnv.seedManager.seed({
          collections: ["users"],
          environment: "test",
          truncate: false,
        }),
      ]);

      const catalogs = await testEnv.payload.find({
        collection: "catalogs",
        limit: 100,
      });

      const users = await testEnv.payload.find({
        collection: "users",
        limit: 100,
      });

      expect(catalogs.docs.length).toBeGreaterThan(0);
      expect(users.docs.length).toBeGreaterThan(0);
    });
  });

  describe("File Operations", () => {
    it("should create files in isolated temp directory", async () => {
      const fs = await import("fs");
      const path = await import("path");

      const testId = createTestId();
      const testFile = path.join(testEnv.tempDir, `${testId}.csv`);

      await fs.promises.writeFile(testFile, "test,data\n1,2");

      expect(fs.existsSync(testFile)).toBe(true);

      const content = await fs.promises.readFile(testFile, "utf-8");
      expect(content).toBe("test,data\n1,2");
    });
  });
});
