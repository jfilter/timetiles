/**
 * Integration tests for the legal notices API endpoint.
 *
 * Tests that legal notice configuration is returned correctly from Settings,
 * including locale handling and cache headers.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../../../app/api/legal-notices/route";

describe.sequential("/api/legal-notices", () => {
  let payload: Payload;
  let testEnv: any;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment } = await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("should return empty notices when no legal settings configured", async () => {
    const request = new NextRequest("http://localhost:3000/api/legal-notices");
    const response = await GET(request, {} as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.termsUrl).toBeNull();
    expect(data.privacyUrl).toBeNull();
    expect(data.registrationDisclaimer).toBeNull();
  });

  it("should return configured legal URLs", async () => {
    await payload.updateGlobal({ slug: "settings", data: { legal: { termsUrl: "/terms", privacyUrl: "/privacy" } } });

    const request = new NextRequest("http://localhost:3000/api/legal-notices");
    const response = await GET(request, {} as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.termsUrl).toBe("/terms");
    expect(data.privacyUrl).toBe("/privacy");
  });

  it("should return localized disclaimer for German locale", async () => {
    await payload.updateGlobal({
      slug: "settings",
      data: { legal: { registrationDisclaimer: "This is a demo." } },
      locale: "en",
    });
    await payload.updateGlobal({
      slug: "settings",
      data: { legal: { registrationDisclaimer: "Dies ist eine Demo." } },
      locale: "de",
    });

    const requestDe = new NextRequest("http://localhost:3000/api/legal-notices?locale=de");
    const responseDe = await GET(requestDe, {} as any);
    const dataDe = await responseDe.json();

    expect(dataDe.registrationDisclaimer).toBe("Dies ist eine Demo.");

    const requestEn = new NextRequest("http://localhost:3000/api/legal-notices?locale=en");
    const responseEn = await GET(requestEn, {} as any);
    const dataEn = await responseEn.json();

    expect(dataEn.registrationDisclaimer).toBe("This is a demo.");
  });

  it("should fall back to English for invalid locale", async () => {
    const request = new NextRequest("http://localhost:3000/api/legal-notices?locale=xyz");
    const response = await GET(request, {} as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.registrationDisclaimer).toBe("This is a demo.");
  });

  it("should set cache headers", async () => {
    const request = new NextRequest("http://localhost:3000/api/legal-notices");
    const response = await GET(request, {} as any);

    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
  });
});
