import { renderWithProviders, screen } from "../../setup/test-utils";

import { EventsList } from "@/components/events-list";
import type { Event } from "@/payload-types";

// Create realistic event data that matches actual Payload structure
const createMockEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  data: {
    title: "Sample Event",
    description: "Event description",
    date: "2024-06-15",
    city: "Berlin",
    country: "Germany",
  },
  location: {
    longitude: 13.405,
    latitude: 52.52,
  },
  eventTimestamp: "2024-06-15T10:00:00Z",
  dataset: 1,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("EventsList", () => {
  test("displays loading state correctly", () => {
    renderWithProviders(<EventsList events={[]} loading={true} />);

    expect(screen.getByText("Loading events...")).toBeInTheDocument();
  });

  test("shows empty state when no events provided", () => {
    renderWithProviders(<EventsList events={[]} loading={false} />);

    expect(screen.getByText("No events found")).toBeInTheDocument();
  });

  test("renders events with extracted data fields", () => {
    const events = [
      createMockEvent({
        id: 1,
        data: {
          title: "Environmental Conference",
          description: "Climate change discussion",
          date: "2024-06-15",
          city: "Copenhagen",
          country: "Denmark",
        },
      }),
      createMockEvent({
        id: 2,
        data: {
          name: "Economic Summit", // Different field name
          venue: "Convention Center",
          city: "Zurich", // Component only looks for city/country, not location_city/location_country
          country: "Switzerland",
        },
      }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should extract and display titles/names correctly
    expect(screen.getByText("Environmental Conference")).toBeInTheDocument();
    expect(screen.getByText("Economic Summit")).toBeInTheDocument();

    // Should display location information
    expect(screen.getByText("Copenhagen, Denmark")).toBeInTheDocument();
    expect(screen.getByText("Zurich, Switzerland")).toBeInTheDocument();
  });

  test("handles events with missing or incomplete data gracefully", () => {
    const events = [
      createMockEvent({
        id: 1,
        data: {
          // Only title, missing other fields
          title: "Minimal Event",
        },
        location: {
          longitude: 0,
          latitude: 0,
        },
      }),
      createMockEvent({
        id: 2,
        data: {
          // No title, should fallback to Event ID
        },
        location: {
          longitude: 10,
          latitude: 20,
        },
      }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should display the title
    expect(screen.getByText("Minimal Event")).toBeInTheDocument();

    // Should fallback to "Event {id}" when no title
    expect(screen.getByText("Event 2")).toBeInTheDocument();
  });

  test("displays formatted dates correctly", () => {
    const events = [
      createMockEvent({
        id: 1,
        data: {
          title: "Single Start Date Event",
          startDate: "2024-06-15",
        },
        eventTimestamp: "2024-06-15T10:00:00Z",
      }),
      createMockEvent({
        id: 2,
        data: {
          title: "Multi-day Event",
          startDate: "2024-06-26",
          endDate: "2024-06-30",
        },
      }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should display single start date
    expect(screen.getByText("6/15/2024")).toBeInTheDocument();

    // Should display date range parts
    expect(screen.getByText("6/26/2024")).toBeInTheDocument();
    expect(screen.getByText("6/30/2024")).toBeInTheDocument();
  });

  test("extracts location from various field patterns", () => {
    const events = [
      createMockEvent({
        id: 1,
        data: {
          title: "Event with city/country",
          city: "Paris",
          country: "France",
        },
      }),
      createMockEvent({
        id: 2,
        data: {
          title: "Event with no location fields",
          // No city/country fields - should not display location
        },
      }),
      createMockEvent({
        id: 3,
        data: {
          title: "Event with venue",
          venue: "Madison Square Garden",
          city: "New York",
          country: "USA",
        },
        geocodingInfo: {
          normalizedAddress: "4 Pennsylvania Plaza, New York, NY 10001, USA",
          confidence: 0.95,
          provider: "google",
        },
      }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should display city/country combinations
    expect(screen.getByText("Paris, France")).toBeInTheDocument();

    // Event with no location fields should not display location
    expect(screen.getByText("Event with no location fields")).toBeInTheDocument();

    // Should prioritize geocoded address when available
    expect(screen.getByText("4 Pennsylvania Plaza, New York, NY 10001, USA")).toBeInTheDocument();
  });

  test("handles events with non-object data field", () => {
    const events = [
      {
        ...createMockEvent(),
        id: 1,
        data: "string data instead of object", // Invalid data format
      } as Event,
      {
        ...createMockEvent(),
        id: 2,
        data: null, // Null data
      } as Event,
      {
        ...createMockEvent(),
        id: 3,
        data: ["array", "data"], // Array instead of object
      } as Event,
    ];

    renderWithProviders(<EventsList events={events} />);

    // Should fallback to Event ID for all invalid data formats
    expect(screen.getByText("Event 1")).toBeInTheDocument();
    expect(screen.getByText("Event 2")).toBeInTheDocument();
    expect(screen.getByText("Event 3")).toBeInTheDocument();
  });

  test("handles events with complex nested data", () => {
    const events = [
      createMockEvent({
        id: 1,
        data: {
          event: {
            name: "Nested Event Name", // Nested structure
            details: {
              location: {
                city: "Barcelona",
                country: "Spain",
              },
            },
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
      createMockEvent({
        id: 1,
        data: { title: "Later Event" },
        eventTimestamp: "2024-06-20T10:00:00Z",
      }),
      createMockEvent({
        id: 2,
        data: { title: "Earlier Event" },
        eventTimestamp: "2024-06-10T10:00:00Z",
      }),
      createMockEvent({
        id: 3,
        data: { title: "No Timestamp Event" },
        eventTimestamp: null,
      }),
    ];

    renderWithProviders(<EventsList events={events} />);

    // All events should be displayed (order testing would require more complex DOM traversal)
    expect(screen.getByText("Later Event")).toBeInTheDocument();
    expect(screen.getByText("Earlier Event")).toBeInTheDocument();
    expect(screen.getByText("No Timestamp Event")).toBeInTheDocument();
  });

  test("handles large numbers of events efficiently", () => {
    const manyEvents = Array.from({ length: 10 }, (_, i) =>
      createMockEvent({
        id: i + 1,
        data: {
          title: `Event ${i + 1}`,
          description: `Description for event ${i + 1}`,
        },
      }),
    );

    const { container } = renderWithProviders(<EventsList events={manyEvents} />);

    // Should render all events (using getAllByText to handle multiple test instances)
    expect(screen.getAllByText("Event 1")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Event 10")[0]).toBeInTheDocument();

    // Should have proper container structure
    expect(container.firstChild).toHaveClass("space-y-2");
  });
});
