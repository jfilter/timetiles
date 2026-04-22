/**
 * @module
 */
import { EventsList } from "@/app/[locale]/(frontend)/explore/_components/events-list";
import type { EventListItem } from "@/lib/schemas/events";

import { renderWithProviders, screen } from "../../setup/unit/react-render";

// Create mock event matching the list API DTO shape
const createMockEvent = (overrides: Partial<EventListItem> = {}): EventListItem => ({
  id: 1,
  data: {
    title: "Sample Event",
    description: "Event description",
    date: "2024-06-15",
    city: "Berlin",
    country: "Germany",
  },
  location: { longitude: 13.405, latitude: 52.52 },
  eventTimestamp: "2024-06-15T10:00:00Z",
  dataset: { id: 1 },
  isValid: true,
  ...overrides,
});

describe("EventsList", () => {
  test("displays loading state correctly", () => {
    const { container } = renderWithProviders(<EventsList events={[]} isInitialLoad />);

    // EventsListSkeleton renders pulse-animated placeholder divs
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  test("shows empty state when no events provided", () => {
    renderWithProviders(<EventsList events={[]} />);

    expect(screen.getByText("No events found")).toBeInTheDocument();
  });

  test("renders events with enriched data from backend", () => {
    const events = [
      createMockEvent({
        id: 1,
        data: { title: "Environmental Conference", description: "Climate change discussion" },
        eventTimestamp: "2024-06-15T10:00:00Z",
      }),
      createMockEvent({ id: 2, data: { title: "Economic Summit" }, eventTimestamp: "2024-07-01T10:00:00Z" }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should display backend-provided titles
    expect(screen.getByText("Environmental Conference")).toBeInTheDocument();
    expect(screen.getByText("Economic Summit")).toBeInTheDocument();
  });

  test("displays formatted dates from eventTimestamp", () => {
    const events = [
      createMockEvent({ id: 1, data: { title: "Event with timestamp" }, eventTimestamp: "2024-09-20T10:00:00Z" }),
      createMockEvent({ id: 2, data: { title: "Event without timestamp" }, eventTimestamp: "" }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should display date from eventTimestamp
    expect(screen.getByText("Sep 20, 2024")).toBeInTheDocument();

    // Event without timestamp should not display date
    expect(screen.getByText("Event without timestamp")).toBeInTheDocument();
  });

  test("displays location from locationName and geocodedAddress", () => {
    const events = [
      createMockEvent({ id: 1, data: { title: "Event with venue" }, locationName: "Bella Center" }),
      createMockEvent({
        id: 2,
        data: { title: "Event with geocoded address" },
        geocodedAddress: "Copenhagen, Denmark",
      }),
      createMockEvent({ id: 3, data: { title: "Event with no location" } }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should display venue name
    expect(screen.getByText("Bella Center")).toBeInTheDocument();

    // Should display geocoded address
    expect(screen.getByText("Copenhagen, Denmark")).toBeInTheDocument();

    // Event with no location should not display location row
    expect(screen.getByText("Event with no location")).toBeInTheDocument();
  });

  test("sorts events chronologically when eventTimestamp is available", () => {
    const events = [
      createMockEvent({ id: 1, data: { title: "Later Event" }, eventTimestamp: "2024-06-20T10:00:00Z" }),
      createMockEvent({ id: 2, data: { title: "Earlier Event" }, eventTimestamp: "2024-06-10T10:00:00Z" }),
      createMockEvent({ id: 3, data: { title: "No Timestamp Event" }, eventTimestamp: "" }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Verify reverse-chronological order (newest first) via DOM position
    const titles = screen.getAllByRole("heading").map((el) => el.textContent);
    const laterIdx = titles.indexOf("Later Event");
    const earlierIdx = titles.indexOf("Earlier Event");
    const noTimestampIdx = titles.indexOf("No Timestamp Event");
    expect(laterIdx).toBeLessThan(earlierIdx);
    // Events without timestamps sort to the end
    expect(noTimestampIdx).toBeGreaterThan(earlierIdx);
  });

  test("handles large numbers of events efficiently", () => {
    const manyEvents = Array.from({ length: 10 }, (_, i) =>
      createMockEvent({ id: i + 1, data: { title: `Event ${i + 1}`, description: `Description for event ${i + 1}` } })
    );

    const { container } = renderWithProviders(<EventsList events={manyEvents} />);

    // Should render all events (using getAllByText to handle multiple test instances)
    expect(screen.getAllByText("Event 1")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Event 10")[0]).toBeInTheDocument();

    // Should have proper container structure - now wrapped in relative div
    const innerContainer = container.querySelector(".space-y-2");
    expect(innerContainer).toBeInTheDocument();
  });
});
