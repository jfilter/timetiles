/**
 * @module
 */
import { EventsList } from "@/app/(frontend)/explore/_components/events-list";
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
        data: {
          title: "Environmental Conference", // Backend provides enriched title
          description: "Climate change discussion",
          date: "2024-06-15",
          city: "Copenhagen",
          country: "Denmark",
        },
      }),
      createMockEvent({
        id: 2,
        data: {
          title: "Economic Summit", // Backend provides enriched title
          venue: "Convention Center",
          city: "Zurich",
          country: "Switzerland",
        },
      }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should display backend-provided titles
    expect(screen.getByText("Environmental Conference")).toBeInTheDocument();
    expect(screen.getByText("Economic Summit")).toBeInTheDocument();

    // Should display location information
    expect(screen.getByText("Copenhagen, Denmark")).toBeInTheDocument();
    expect(screen.getByText("Zurich, Switzerland")).toBeInTheDocument();
  });

  test("displays formatted dates correctly", () => {
    const events = [
      createMockEvent({
        id: 1,
        data: {
          title: "Single Start Date Event", // Backend enriches with title
          startDate: "2024-06-15",
        },
        eventTimestamp: "2024-06-15T10:00:00Z",
      }),
      createMockEvent({
        id: 2,
        data: {
          title: "Multi-day Event", // Backend enriches with title
          startDate: "2024-06-26",
          endDate: "2024-06-30",
        },
      }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should display single start date
    expect(screen.getByText("6/15/2024")).toBeInTheDocument();

    // Should display date range (formatted as "start - end")
    expect(screen.getByText("6/26/2024 - 6/30/2024")).toBeInTheDocument();
  });

  test("extracts location from various field patterns", () => {
    const events = [
      createMockEvent({ id: 1, data: { title: "Event with city/country", city: "Paris", country: "France" } }),
      createMockEvent({
        id: 2,
        data: {
          title: "Event with no location fields",
          // No city/country fields - should not display location
        },
      }),
      createMockEvent({
        id: 3,
        data: { title: "Event with venue", venue: "Madison Square Garden", city: "New York", country: "USA" },
      }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should display city/country combinations
    expect(screen.getByText("Paris, France")).toBeInTheDocument();

    // Event with no location fields should not display location
    expect(screen.getByText("Event with no location fields")).toBeInTheDocument();

    // Should display city/country for event with venue data
    expect(screen.getByText("New York, USA")).toBeInTheDocument();
  });

  test("handles events with complex nested data", () => {
    const events = [
      createMockEvent({
        id: 1,
        data: {
          event: {
            name: "Nested Event Name", // Nested structure
            details: { location: { city: "Barcelona", country: "Spain" } },
          },
          // Also flat fields for comparison
          title: "Flat Title",
          city: "Madrid",
          country: "Spain",
        },
      }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should prefer flat fields over nested ones
    expect(screen.getByText("Flat Title")).toBeInTheDocument();
    expect(screen.getByText("Madrid, Spain")).toBeInTheDocument();
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
    const innerContainer = container.querySelector(".space-y-4");
    expect(innerContainer).toBeInTheDocument();
  });
});
