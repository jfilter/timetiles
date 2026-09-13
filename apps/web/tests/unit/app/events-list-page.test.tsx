/**
 * Unit tests for the server-rendered events list page title extraction.
 *
 * @module
 * @category Tests
 */
import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn() }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({ find: mocks.find }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
  getLocale: vi.fn().mockResolvedValue("en"),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, className }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import EventsListPage from "@/app/[locale]/(frontend)/events/page";

const baseEvent = { eventTimestamp: null, location: null, validationStatus: "valid" };

describe("EventsListPage", () => {
  beforeEach(() => {
    mocks.find.mockReset();
  });

  it("renders a fallback title for an event whose transformedData is null", async () => {
    mocks.find.mockResolvedValue({ docs: [{ ...baseEvent, id: 7, dataset: 1, transformedData: null }] });

    const html = renderToStaticMarkup(await EventsListPage());

    expect(html).toContain("Event 7");
  });

  it("uses the dataset plan's title role mapping", async () => {
    mocks.find.mockResolvedValue({
      docs: [
        {
          ...baseEvent,
          id: 8,
          dataset: { id: 1, name: "Dataset A", interpretationPlan: { roles: { title: "titel" } } },
          transformedData: { titel: "Stadtfest" },
        },
      ],
    });

    const html = renderToStaticMarkup(await EventsListPage());

    expect(html).toContain("Stadtfest");
    expect(html).not.toContain("Event 8");
  });
});
