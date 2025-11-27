/**
 * Integration tests for the Branding global.
 *
 * Tests the branding global configuration including site name, description,
 * logo uploads, and favicon generation.
 *
 * @module
 */
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment, withUsers } from "../../setup/integration/environment";

describe.sequential("Branding Global", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  describe("Default Values", () => {
    it("should have default site name", async () => {
      const branding = await payload.findGlobal({ slug: "branding" });

      expect(branding.siteName).toBe("TimeTiles");
    });

    it("should have default site description", async () => {
      const branding = await payload.findGlobal({ slug: "branding" });

      expect(branding.siteDescription).toBe("Making spatial and temporal data analysis accessible to everyone.");
    });

    it("should have no logo fields by default", async () => {
      const branding = await payload.findGlobal({ slug: "branding" });

      // Upload fields are undefined/null when not set
      expect(branding.logoLight).toBeFalsy();
      expect(branding.logoDark).toBeFalsy();
    });

    it("should have no favicon fields by default", async () => {
      const branding = await payload.findGlobal({ slug: "branding" });

      // Upload fields are undefined/null when not set
      expect(branding.faviconSourceLight).toBeFalsy();
      expect(branding.faviconSourceDark).toBeFalsy();
    });
  });

  describe("Update Operations", () => {
    beforeEach(async () => {
      // Reset branding to defaults before each test
      await payload.updateGlobal({
        slug: "branding",
        data: {
          siteName: "TimeTiles",
          siteDescription: "Making spatial and temporal data analysis accessible to everyone.",
          logoLight: null,
          logoDark: null,
          faviconSourceLight: null,
          faviconSourceDark: null,
        },
      });
    });

    it("should update site name", async () => {
      const updated = await payload.updateGlobal({
        slug: "branding",
        data: {
          siteName: "Custom Brand",
        },
      });

      expect(updated.siteName).toBe("Custom Brand");

      // Verify it persists
      const retrieved = await payload.findGlobal({ slug: "branding" });
      expect(retrieved.siteName).toBe("Custom Brand");
    });

    it("should update site description", async () => {
      const updated = await payload.updateGlobal({
        slug: "branding",
        data: {
          siteDescription: "A custom description for testing.",
        },
      });

      expect(updated.siteDescription).toBe("A custom description for testing.");

      // Verify it persists
      const retrieved = await payload.findGlobal({ slug: "branding" });
      expect(retrieved.siteDescription).toBe("A custom description for testing.");
    });

    it("should update multiple fields at once", async () => {
      const updated = await payload.updateGlobal({
        slug: "branding",
        data: {
          siteName: "Multi Update Test",
          siteDescription: "Testing multiple field updates.",
        },
      });

      expect(updated.siteName).toBe("Multi Update Test");
      expect(updated.siteDescription).toBe("Testing multiple field updates.");
    });

    it("should allow empty string for site name", async () => {
      const updated = await payload.updateGlobal({
        slug: "branding",
        data: {
          siteName: "",
        },
      });

      expect(updated.siteName).toBe("");
    });
  });

  describe("Access Control", () => {
    it("should allow public read access", async () => {
      // findGlobal without user context should work
      const branding = await payload.findGlobal({
        slug: "branding",
        overrideAccess: false,
      });

      expect(branding).toBeDefined();
      expect(branding.siteName).toBeDefined();
    });
  });
});

describe.sequential("Branding Favicon Generation", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  const publicDir = join(process.cwd(), "public");

  // Generated favicon files to clean up after tests
  const generatedFiles = [
    "favicon-light.ico",
    "favicon-dark.ico",
    "apple-touch-icon-light.png",
    "apple-touch-icon-dark.png",
    "icon-192-light.png",
    "icon-192-dark.png",
    "icon-512-light.png",
    "icon-512-dark.png",
  ];

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  afterEach(() => {
    // Clean up any generated favicon files
    for (const file of generatedFiles) {
      const filePath = join(publicDir, file);
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  });

  it("should not generate favicons when no source is provided", async () => {
    // Update with no favicon sources
    await payload.updateGlobal({
      slug: "branding",
      data: {
        siteName: "Test",
        faviconSourceLight: null,
        faviconSourceDark: null,
      },
    });

    // The hook should not throw an error
    const branding = await payload.findGlobal({ slug: "branding" });
    expect(branding.faviconSourceLight).toBeNull();
    expect(branding.faviconSourceDark).toBeNull();
  });

  it("should handle favicon source removal gracefully", async () => {
    // First set a source (even though it's null), then remove it
    await payload.updateGlobal({
      slug: "branding",
      data: {
        faviconSourceLight: null,
      },
    });

    // Update again to trigger the hook with previousDoc
    const updated = await payload.updateGlobal({
      slug: "branding",
      data: {
        siteName: "Updated Name",
      },
    });

    // Should complete without error
    expect(updated.siteName).toBe("Updated Name");
  });

  it("should generate favicon files when source is uploaded", async () => {
    // Import sharp dynamically to create a test image
    const sharp = (await import("sharp")).default;

    // Create a test admin user for media upload (use object form for unique email)
    const { users } = await withUsers(testEnv, {
      admin: { role: "admin", email: `favicon-test-1-${Date.now()}@test.com` },
    });

    // Create a simple 512x512 red square PNG as test image
    const testImageBuffer = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    // Upload the test image to media collection
    const mediaDoc = await payload.create({
      collection: "media",
      data: {
        alt: "Test favicon source",
      },
      file: {
        data: testImageBuffer,
        mimetype: "image/png",
        name: "test-favicon.png",
        size: testImageBuffer.length,
      },
      user: users.admin,
    });

    expect(mediaDoc.id).toBeDefined();
    expect(mediaDoc.url).toBeDefined();

    // Set the uploaded image as favicon source
    await payload.updateGlobal({
      slug: "branding",
      data: {
        faviconSourceLight: mediaDoc.id,
      },
    });

    // Verify the branding was updated
    const branding = await payload.findGlobal({ slug: "branding" });
    expect(branding.faviconSourceLight).toBeDefined();

    // Check that favicon files were generated
    const expectedFiles = [
      "favicon-light.ico",
      "apple-touch-icon-light.png",
      "icon-192-light.png",
      "icon-512-light.png",
    ];

    for (const file of expectedFiles) {
      const filePath = join(publicDir, file);
      expect(existsSync(filePath), `Expected ${file} to exist`).toBe(true);
    }
  });

  it("should generate both light and dark favicon sets", async () => {
    const sharp = (await import("sharp")).default;
    const { users } = await withUsers(testEnv, {
      admin: { role: "admin", email: `favicon-test-2-${Date.now()}@test.com` },
    });

    // Create light favicon source (blue square)
    const lightImageBuffer = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    // Create dark favicon source (yellow square)
    const darkImageBuffer = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 255, g: 255, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    // Upload both images
    const lightMedia = await payload.create({
      collection: "media",
      data: { alt: "Light favicon" },
      file: {
        data: lightImageBuffer,
        mimetype: "image/png",
        name: "light-favicon.png",
        size: lightImageBuffer.length,
      },
      user: users.admin,
    });

    const darkMedia = await payload.create({
      collection: "media",
      data: { alt: "Dark favicon" },
      file: {
        data: darkImageBuffer,
        mimetype: "image/png",
        name: "dark-favicon.png",
        size: darkImageBuffer.length,
      },
      user: users.admin,
    });

    // Set both as favicon sources
    await payload.updateGlobal({
      slug: "branding",
      data: {
        faviconSourceLight: lightMedia.id,
        faviconSourceDark: darkMedia.id,
      },
    });

    // Check that all favicon files were generated for both themes
    const lightFiles = ["favicon-light.ico", "apple-touch-icon-light.png", "icon-192-light.png", "icon-512-light.png"];
    const darkFiles = ["favicon-dark.ico", "apple-touch-icon-dark.png", "icon-192-dark.png", "icon-512-dark.png"];

    for (const file of [...lightFiles, ...darkFiles]) {
      const filePath = join(publicDir, file);
      expect(existsSync(filePath), `Expected ${file} to exist`).toBe(true);
    }
  });
});
