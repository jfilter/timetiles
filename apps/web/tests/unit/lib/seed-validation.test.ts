import { catalogSeeds } from "../../../lib/seed/seeds/catalogs";
import { datasetSeeds } from "../../../lib/seed/seeds/datasets";
import { eventSeeds } from "../../../lib/seed/seeds/events";
import { importSeeds } from "../../../lib/seed/seeds/imports";
import { userSeeds } from "../../../lib/seed/seeds/users";

describe("Seed Data Validation", () => {
  describe("User Seeds", () => {
    it("should generate valid users for development environment", () => {
      const users = userSeeds("development");
      expect(users.length).toBeGreaterThan(0);
      expect(users.every((user) => user.email && user.password)).toBe(true);
    });

    it("should generate valid users for production environment", () => {
      const users = userSeeds("production");
      expect(users.length).toBeGreaterThan(0);
      expect(users.every((user) => user.role && user.isActive !== undefined)).toBe(true);
    });
  });

  describe("Catalog Seeds", () => {
    it("should generate valid catalogs for development environment", () => {
      const catalogs = catalogSeeds("development");
      expect(catalogs.length).toBeGreaterThan(0);
      expect(catalogs.every((catalog) => catalog.name && catalog.slug)).toBe(true);
    });

    it("should have proper status values", () => {
      const catalogs = catalogSeeds("development");
      expect(catalogs.every((catalog) => catalog.status && ["active", "archived"].includes(catalog.status))).toBe(true);
    });
  });

  describe("Dataset Seeds", () => {
    it("should generate valid datasets for development environment", () => {
      const datasets = datasetSeeds("development");
      expect(datasets.length).toBeGreaterThan(0);
      expect(datasets.every((dataset) => dataset.name && dataset.schema)).toBe(true);
    });

    it("should have proper catalog references", () => {
      const datasets = datasetSeeds("development");
      expect(datasets.every((dataset) => dataset.catalog && typeof dataset.catalog === "string")).toBe(true);
    });

    it("should have valid language codes", () => {
      const datasets = datasetSeeds("development");
      expect(datasets.every((dataset) => dataset.language && dataset.language.length === 3)).toBe(true);
    });
  });

  describe("Event Seeds", () => {
    it("should generate valid events for development environment", () => {
      const events = eventSeeds("development");
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.dataset && event.data)).toBe(true);
    });

    it("should have proper dataset references", () => {
      const events = eventSeeds("development");
      expect(events.every((event) => event.dataset && typeof event.dataset === "string")).toBe(true);
    });

    it("should have valid timestamps", () => {
      const events = eventSeeds("development");
      expect(events.every((event) => event.eventTimestamp instanceof Date)).toBe(true);
    });
  });

  describe("Import Seeds", () => {
    it("should generate valid imports for development environment", () => {
      const imports = importSeeds("development");
      expect(imports.length).toBeGreaterThan(0);
      expect(imports.every((imp) => imp.fileName && imp.catalog)).toBe(true);
    });

    it("should have proper status values", () => {
      const imports = importSeeds("development");
      expect(
        imports.every((imp) => imp.status && ["pending", "processing", "completed", "failed"].includes(imp.status)),
      ).toBe(true);
    });

    it("should have proper catalog references", () => {
      const imports = importSeeds("development");
      expect(imports.every((imp) => imp.catalog && typeof imp.catalog === "string")).toBe(true);
    });
  });

  describe("Data Consistency", () => {
    it("should generate different amounts of data per environment", () => {
      const devUsers = userSeeds("development");
      const prodUsers = userSeeds("production");

      // Development should have more data than production
      expect(devUsers.length).toBeGreaterThan(prodUsers.length);
    });

    it("should include development-specific data in development environment", () => {
      const devCatalogs = catalogSeeds("development");
      const devDatasets = datasetSeeds("development");
      const devEvents = eventSeeds("development");

      // Check for development-specific data
      expect(devCatalogs.some((c) => c.slug === "community-events-portal")).toBe(true);
      expect(devDatasets.some((d) => d.slug?.includes("local-events-calendar"))).toBe(true);
      expect(
        devEvents.some((e) => e.data && typeof e.data === "object" && ("venue" in e.data || "performer" in e.data)),
      ).toBe(true);
    });
  });

  describe("Relationship Validation", () => {
    it("should have valid catalog references in imports", () => {
      const environments = ["development", "production"];

      environments.forEach((env) => {
        const catalogs = catalogSeeds(env);
        const imports = importSeeds(env);
        const catalogSlugs = catalogs.map((c) => c.slug);

        imports.forEach((imp) => {
          expect(catalogSlugs).toContain(imp.catalog);
        });
      });
    });

    it("should have valid catalog references in datasets", () => {
      const environments = ["development", "production"];

      environments.forEach((env) => {
        const catalogs = catalogSeeds(env);
        const datasets = datasetSeeds(env);
        const catalogSlugs = catalogs.map((c) => c.slug);

        datasets.forEach((dataset) => {
          expect(catalogSlugs).toContain(dataset.catalog);
        });
      });
    });

    it("should have valid dataset references in events", () => {
      const environments = ["development", "production"];

      environments.forEach((env) => {
        const datasets = datasetSeeds(env);
        const events = eventSeeds(env);
        const datasetSlugs = datasets.map((d) => d.slug).filter(Boolean);

        events.forEach((event) => {
          expect(datasetSlugs).toContain(event.dataset);
        });
      });
    });
  });
});
