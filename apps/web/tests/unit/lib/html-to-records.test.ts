/**
 * Unit tests for the HTML-to-records extraction engine.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import type { DetailPageConfig, HtmlExtractionConfig } from "@/lib/ingest/html-to-records";
import { enrichRecordsFromDetailPages, extractRecordsFromHtml } from "@/lib/ingest/html-to-records";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_HTML = [
  '<article class="card" data-latitude="50.828" data-longitude="12.935" data-categories="Aufenthaltsorte" data-permalink="https://example.com/?p=1">',
  '  <h2 class="card__title">Umzugshelfer</h2>',
  '  <div class="card__tagline">Uwe Böhnhardt</div>',
  '  <div class="card__address">',
  '    <span class="address__street">Bernhardstraße</span>',
  '    <span class="address__street-no">11</span>',
  '    <span class="address__city">Chemnitz</span>',
  "  </div>",
  "</article>",
  '<article class="card" data-latitude="49.138" data-longitude="9.204" data-categories="Mordanschläge" data-permalink="https://example.com/?p=2">',
  '  <h2 class="card__title">Mordanschlag auf Michèle Kiesewetter</h2>',
  '  <div class="card__tagline">Michèle Kiesewetter</div>',
  '  <div class="card__address">',
  '    <span class="address__street">Karlsruher Straße</span>',
  '    <span class="address__street-no">24</span>',
  '    <span class="address__city">Heilbronn</span>',
  "  </div>",
  "</article>",
].join("\n");

const BASE_CONFIG: HtmlExtractionConfig = {
  htmlPath: "html",
  recordSelector: "article.card",
  fields: [
    { name: "latitude", attribute: "data-latitude" },
    { name: "longitude", attribute: "data-longitude" },
    { name: "categories", attribute: "data-categories" },
    { name: "permalink", attribute: "data-permalink" },
    { name: "title", selector: "h2.card__title" },
    { name: "persons", selector: ".card__tagline" },
    { name: "city", selector: ".address__city" },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractRecordsFromHtml", () => {
  it("extracts records from HTML embedded in JSON", () => {
    const json = { found_jobs: true, html: FIXTURE_HTML, max_num_pages: 1 };
    const records = extractRecordsFromHtml(json, BASE_CONFIG);

    expect(records).toHaveLength(2);

    expect(records[0]).toEqual({
      latitude: "50.828",
      longitude: "12.935",
      categories: "Aufenthaltsorte",
      permalink: "https://example.com/?p=1",
      title: "Umzugshelfer",
      persons: "Uwe Böhnhardt",
      city: "Chemnitz",
    });

    expect(records[1]).toEqual({
      latitude: "49.138",
      longitude: "9.204",
      categories: "Mordanschläge",
      permalink: "https://example.com/?p=2",
      title: "Mordanschlag auf Michèle Kiesewetter",
      persons: "Michèle Kiesewetter",
      city: "Heilbronn",
    });
  });

  it("returns empty array when htmlPath resolves to non-string", () => {
    const json = { html: 42 };
    const records = extractRecordsFromHtml(json, BASE_CONFIG);
    expect(records).toEqual([]);
  });

  it("returns empty array when htmlPath does not exist", () => {
    const json = { data: "something" };
    const records = extractRecordsFromHtml(json, BASE_CONFIG);
    expect(records).toEqual([]);
  });

  it("returns empty array when HTML has no matching records", () => {
    const json = { html: "<div>No cards here</div>" };
    const records = extractRecordsFromHtml(json, BASE_CONFIG);
    expect(records).toEqual([]);
  });

  it("returns empty string for missing fields", () => {
    const json = { html: '<article class="card"><h2 class="card__title">Test</h2></article>' };
    const records = extractRecordsFromHtml(json, BASE_CONFIG);

    expect(records).toHaveLength(1);
    expect(records[0]!.title).toBe("Test");
    expect(records[0]!.latitude).toBe("");
    expect(records[0]!.persons).toBe("");
  });

  it("supports nested dot-path for htmlPath", () => {
    const json = { response: { body: FIXTURE_HTML } };
    const config: HtmlExtractionConfig = { ...BASE_CONFIG, htmlPath: "response.body" };
    const records = extractRecordsFromHtml(json, config);
    expect(records).toHaveLength(2);
    expect(records[0]!.title).toBe("Umzugshelfer");
  });

  it("extracts attribute from record element itself when selector is empty", () => {
    const json = { html: '<div class="item" data-id="42"><span class="name">Foo</span></div>' };
    const config: HtmlExtractionConfig = {
      htmlPath: "html",
      recordSelector: "div.item",
      fields: [
        { name: "id", attribute: "data-id" },
        { name: "name", selector: ".name" },
      ],
    };
    const records = extractRecordsFromHtml(json, config);
    expect(records).toEqual([{ id: "42", name: "Foo" }]);
  });

  it("trims whitespace from extracted text", () => {
    const json = { html: '<article class="card"><h2 class="card__title">  Spaced Title  </h2></article>' };
    const config: HtmlExtractionConfig = {
      htmlPath: "html",
      recordSelector: "article.card",
      fields: [{ name: "title", selector: "h2.card__title" }],
    };
    const records = extractRecordsFromHtml(json, config);
    expect(records[0]!.title).toBe("Spaced Title");
  });
});

// ---------------------------------------------------------------------------
// enrichRecordsFromDetailPages
// ---------------------------------------------------------------------------

const DETAIL_HTML = `
<html><body>
  <div class="widget_listing_content">
    Am 25. April 2007 begann der Arbeitstag für Michèle Kiesewetter.
    Die beiden gingen Streife in Heilbronn.
  </div>
</body></html>
`;

describe("enrichRecordsFromDetailPages", () => {
  const detailConfig: DetailPageConfig = {
    urlField: "permalink",
    rateLimitMs: 0,
    fields: [
      { name: "description", selector: ".widget_listing_content" },
      {
        name: "date_raw",
        selector: ".widget_listing_content",
        pattern:
          "\\d{1,2}\\.\\s*(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s*\\d{4}",
      },
    ],
  };

  it("enriches records with fields from detail pages", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(Buffer.from(DETAIL_HTML, "utf-8")));
    const records: Record<string, unknown>[] = [{ title: "Mordanschlag", permalink: "https://example.com/?p=1" }];
    await enrichRecordsFromDetailPages(records, detailConfig, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith("https://example.com/?p=1");
    expect(records[0]!.description).toContain("Michèle Kiesewetter");
    expect(records[0]!.date_raw).toBe("25. April 2007");
  });

  it("skips records with empty URL field", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(Buffer.from("", "utf-8")));
    const records: Record<string, unknown>[] = [{ title: "No URL", permalink: "" }, { title: "Missing" }];
    await enrichRecordsFromDetailPages(records, detailConfig, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("handles fetch errors gracefully", async () => {
    const failFetch = vi.fn(() => Promise.reject(new Error("Network error")));
    const records: Record<string, unknown>[] = [{ title: "Test", permalink: "https://example.com/?p=1" }];
    await enrichRecordsFromDetailPages(records, detailConfig, failFetch);
    expect(records[0]!.description).toBeUndefined();
  });

  it("does not overwrite fields with empty extraction", async () => {
    const emptyFetch = vi.fn(() =>
      Promise.resolve(Buffer.from("<html><body><div>No match</div></body></html>", "utf-8"))
    );
    const records: Record<string, unknown>[] = [
      { title: "Test", permalink: "https://example.com/?p=1", description: "Original" },
    ];
    await enrichRecordsFromDetailPages(records, detailConfig, emptyFetch);
    expect(records[0]!.description).toBe("Original");
  });

  it("extracts attribute when specified", async () => {
    const attrFetch = vi.fn(() =>
      Promise.resolve(
        Buffer.from('<html><body><a class="source" href="https://src.example.com">Link</a></body></html>', "utf-8")
      )
    );
    const attrConfig: DetailPageConfig = {
      urlField: "permalink",
      rateLimitMs: 0,
      fields: [{ name: "source_url", selector: "a.source", attribute: "href" }],
    };
    const records: Record<string, unknown>[] = [{ permalink: "https://example.com/?p=1" }];
    await enrichRecordsFromDetailPages(records, attrConfig, attrFetch);
    expect(records[0]!.source_url).toBe("https://src.example.com");
  });
});
