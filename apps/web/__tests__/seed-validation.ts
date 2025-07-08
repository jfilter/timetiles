import { userSeeds } from "../lib/seed/seeds/users";
import { catalogSeeds } from "../lib/seed/seeds/catalogs";
import { datasetSeeds } from "../lib/seed/seeds/datasets";
import { eventSeeds } from "../lib/seed/seeds/events";
import { importSeeds } from "../lib/seed/seeds/imports";

// Simple test runner for seed data validation
async function runSeedTests() {
  console.log("🧪 Running seed data tests...");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => boolean | Promise<boolean>) {
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result
          .then((r) => {
            if (r) {
              console.log(`✅ ${name}`);
              passed++;
            } else {
              console.log(`❌ ${name}`);
              failed++;
            }
          })
          .catch((err) => {
            console.log(`❌ ${name} - Error: ${err.message}`);
            failed++;
          });
      } else {
        if (result) {
          console.log(`✅ ${name}`);
          passed++;
        } else {
          console.log(`❌ ${name}`);
          failed++;
        }
      }
    } catch (err) {
      console.log(`❌ ${name} - Error: ${(err as Error).message}`);
      failed++;
    }
  }

  // Test user seeds
  test("User seeds for development environment", () => {
    const users = userSeeds("development");
    return (
      users.length > 0 && users.every((user) => user.email && user.password)
    );
  });

  test("User seeds for test environment", () => {
    const users = userSeeds("test");
    return (
      users.length > 0 &&
      users.some((user) => user.email === "testuser@example.com")
    );
  });

  test("User seeds for production environment", () => {
    const users = userSeeds("production");
    return (
      users.length > 0 &&
      users.every((user) => user.role && user.isActive !== undefined)
    );
  });

  // Test catalog seeds
  test("Catalog seeds for development environment", () => {
    const catalogs = catalogSeeds("development");
    return (
      catalogs.length > 0 &&
      catalogs.every((catalog) => catalog.name && catalog.slug)
    );
  });

  test("Catalog seeds for test environment", () => {
    const catalogs = catalogSeeds("test");
    return (
      catalogs.length > 0 &&
      catalogs.some((catalog) => catalog.slug === "test-catalog")
    );
  });

  test("Catalog seeds have proper status values", () => {
    const catalogs = catalogSeeds("development");
    return catalogs.every((catalog) =>
      ["active", "archived"].includes(catalog.status),
    );
  });

  // Test dataset seeds
  test("Dataset seeds for development environment", () => {
    const datasets = datasetSeeds("development");
    return (
      datasets.length > 0 &&
      datasets.every((dataset) => dataset.name && dataset.schema)
    );
  });

  test("Dataset seeds have proper catalog references", () => {
    const datasets = datasetSeeds("development");
    return datasets.every(
      (dataset) => dataset.catalog && typeof dataset.catalog === "string",
    );
  });

  test("Dataset seeds have valid language codes", () => {
    const datasets = datasetSeeds("development");
    return datasets.every(
      (dataset) => dataset.language && dataset.language.length === 3,
    );
  });

  // Test event seeds
  test("Event seeds for development environment", () => {
    const events = eventSeeds("development");
    return (
      events.length > 0 && events.every((event) => event.dataset && event.data)
    );
  });

  test("Event seeds have proper dataset references", () => {
    const events = eventSeeds("development");
    return events.every(
      (event) => event.dataset && typeof event.dataset === "string",
    );
  });

  test("Event seeds have valid timestamps", () => {
    const events = eventSeeds("development");
    return events.every((event) => event.eventTimestamp instanceof Date);
  });

  // Test import seeds
  test("Import seeds for development environment", () => {
    const imports = importSeeds("development");
    return (
      imports.length > 0 && imports.every((imp) => imp.fileName && imp.catalog)
    );
  });

  test("Import seeds have proper status values", () => {
    const imports = importSeeds("development");
    return imports.every((imp) =>
      ["pending", "processing", "completed", "failed"].includes(imp.status),
    );
  });

  test("Import seeds have proper catalog references", () => {
    const imports = importSeeds("development");
    return imports.every(
      (imp) => imp.catalog && typeof imp.catalog === "string",
    );
  });

  // Test data consistency
  test("All seed environments generate different amounts of data", () => {
    const devUsers = userSeeds("development");
    const testUsers = userSeeds("test");
    const prodUsers = userSeeds("production");

    return (
      devUsers.length >= testUsers.length &&
      testUsers.length >= prodUsers.length
    );
  });

  test("Test environment includes test-specific data", () => {
    const testCatalogs = catalogSeeds("test");
    const testDatasets = datasetSeeds("test");
    const testEvents = eventSeeds("test");

    return (
      testCatalogs.some((c) => c.slug === "test-catalog") &&
      testDatasets.some((d) => d.slug === "test-dataset") &&
      testEvents.some((e) => e.data.id === "test-001")
    );
  });

  // Wait for all async tests to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("🎉 All seed data tests passed!");
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSeedTests();
}
