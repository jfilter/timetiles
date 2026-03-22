/**
 * Tests for the DataTable component.
 *
 * Verifies rendering, empty/loading states, sorting, and pagination.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { type ColumnDef, DataTable } from "../data-table";

interface TestItem {
  id: number;
  name: string;
  value: number;
}

const testColumns: ColumnDef<TestItem, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "value", header: "Value" },
];

const testData: TestItem[] = [
  { id: 1, name: "Alpha", value: 10 },
  { id: 2, name: "Beta", value: 20 },
  { id: 3, name: "Charlie", value: 30 },
];

const manyItems: TestItem[] = Array.from({ length: 15 }, (_, i) => ({
  id: i + 1,
  name: `Item ${String(i + 1).padStart(2, "0")}`,
  value: (i + 1) * 10,
}));

describe("DataTable - basic rendering", () => {
  it("renders column headers", () => {
    render(<DataTable columns={testColumns} data={testData} />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
  });

  it("renders all data rows", () => {
    render(<DataTable columns={testColumns} data={testData} />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("renders the correct number of body rows", () => {
    render(<DataTable columns={testColumns} data={testData} />);

    const table = screen.getByRole("table");
    const tbody = within(table).getAllByRole("rowgroup")[1]!;
    const rows = within(tbody).getAllByRole("row");

    expect(rows).toHaveLength(3);
  });
});

describe("DataTable - empty state", () => {
  it("shows default 'No results.' when data is empty", () => {
    render(<DataTable columns={testColumns} data={[]} />);

    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("shows custom emptyState ReactNode when provided and data is empty", () => {
    const customEmpty = <p>Nothing to see here</p>;

    render(<DataTable columns={testColumns} data={[]} emptyState={customEmpty} />);

    expect(screen.getByText("Nothing to see here")).toBeInTheDocument();
    expect(screen.queryByText("No results.")).not.toBeInTheDocument();
  });

  it("does not show empty state when data has rows", () => {
    render(<DataTable columns={testColumns} data={testData} />);

    expect(screen.queryByText("No results.")).not.toBeInTheDocument();
  });
});

describe("DataTable - loading state", () => {
  it("shows skeleton rows when isLoading is true", () => {
    render(<DataTable columns={testColumns} data={[]} isLoading />);

    expect(screen.queryByText("No results.")).not.toBeInTheDocument();

    // Default loadingRowCount is 5, each row has 2 columns = 10 skeleton cells
    const skeletonCells = document.querySelectorAll(".animate-pulse");
    expect(skeletonCells).toHaveLength(5 * testColumns.length);
  });

  it("does not show data rows when loading", () => {
    render(<DataTable columns={testColumns} data={testData} isLoading />);

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("respects loadingRowCount prop", () => {
    render(<DataTable columns={testColumns} data={[]} isLoading loadingRowCount={3} />);

    const skeletonCells = document.querySelectorAll(".animate-pulse");
    expect(skeletonCells).toHaveLength(3 * testColumns.length);
  });

  it("uses default of 5 skeleton rows when loadingRowCount is not specified", () => {
    render(<DataTable columns={testColumns} data={[]} isLoading />);

    const skeletonCells = document.querySelectorAll(".animate-pulse");
    expect(skeletonCells).toHaveLength(5 * testColumns.length);
  });
});

describe("DataTable - sorting", () => {
  it("clicking a sortable column header sorts ascending first", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={testColumns} data={testData} />);

    const nameHeader = screen.getByRole("button", { name: /name/i });
    await user.click(nameHeader);

    const table = screen.getByRole("table");
    const tbody = within(table).getAllByRole("rowgroup")[1]!;
    const rows = within(tbody).getAllByRole("row");

    // Ascending: Alpha, Beta, Charlie
    expect(within(rows[0]!).getByText("Alpha")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Beta")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Charlie")).toBeInTheDocument();
  });

  it("clicking a column header twice sorts descending", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={testColumns} data={testData} />);

    const nameHeader = screen.getByRole("button", { name: /name/i });
    await user.click(nameHeader); // asc
    await user.click(nameHeader); // desc

    const table = screen.getByRole("table");
    const tbody = within(table).getAllByRole("rowgroup")[1]!;
    const rows = within(tbody).getAllByRole("row");

    // Descending: Charlie, Beta, Alpha
    expect(within(rows[0]!).getByText("Charlie")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Beta")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Alpha")).toBeInTheDocument();
  });

  it("sorts numeric values correctly when clicked twice", async () => {
    const user = userEvent.setup();

    // Use values NOT in ascending order to prove sorting works
    const unsortedData: TestItem[] = [
      { id: 1, name: "Alpha", value: 20 },
      { id: 2, name: "Beta", value: 10 },
      { id: 3, name: "Charlie", value: 30 },
    ];

    render(<DataTable columns={testColumns} data={unsortedData} />);

    const valueHeader = screen.getByRole("button", { name: /value/i });
    // Numeric columns sort desc-first in tanstack/react-table, click twice for ascending
    await user.click(valueHeader); // desc
    await user.click(valueHeader); // asc

    const table = screen.getByRole("table");
    const tbody = within(table).getAllByRole("rowgroup")[1]!;
    const rows = within(tbody).getAllByRole("row");
    const firstRowCells = within(rows[0]!).getAllByRole("cell");
    const secondRowCells = within(rows[1]!).getAllByRole("cell");
    const thirdRowCells = within(rows[2]!).getAllByRole("cell");

    // Ascending by value: Beta(10), Alpha(20), Charlie(30)
    expect(firstRowCells[1]!).toHaveTextContent("10");
    expect(secondRowCells[1]!).toHaveTextContent("20");
    expect(thirdRowCells[1]!).toHaveTextContent("30");
  });

  it("renders sortable columns as buttons", () => {
    render(<DataTable columns={testColumns} data={testData} />);

    const sortButtons = screen.getAllByRole("button");
    const headerButtons = sortButtons.filter(
      (btn) => btn.textContent?.includes("Name") || btn.textContent?.includes("Value")
    );

    expect(headerButtons).toHaveLength(2);
  });

  it("does not render non-sortable columns as buttons", () => {
    const columnsWithNonSortable: ColumnDef<TestItem, unknown>[] = [
      { accessorKey: "name", header: "Name", enableSorting: false },
      { accessorKey: "value", header: "Value" },
    ];

    render(<DataTable columns={columnsWithNonSortable} data={testData} />);

    const valueButton = screen.getByRole("button", { name: /value/i });
    expect(valueButton).toBeInTheDocument();

    // "Name" should be plain text, not a button
    expect(screen.queryByRole("button", { name: /^name$/i })).not.toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
  });
});

describe("DataTable - sort indicator", () => {
  it("shows unsorted indicator by default on sortable columns", () => {
    render(<DataTable columns={testColumns} data={testData} />);

    // The ArrowUpDownIcon (unsorted) has class "opacity-40"
    const nameButton = screen.getByRole("button", { name: /name/i });
    const unsortedIcon = nameButton.querySelector("svg.opacity-40");
    expect(unsortedIcon).toBeInTheDocument();
  });

  it("shows ascending indicator after one click", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={testColumns} data={testData} />);

    const nameButton = screen.getByRole("button", { name: /name/i });
    await user.click(nameButton);

    // After sorting, the unsorted icon (opacity-40) should be replaced
    const unsortedIcon = nameButton.querySelector("svg.opacity-40");
    expect(unsortedIcon).not.toBeInTheDocument();

    const sortIcon = nameButton.querySelector("svg");
    expect(sortIcon).toBeInTheDocument();
  });

  it("shows descending indicator after two clicks", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={testColumns} data={testData} />);

    const nameButton = screen.getByRole("button", { name: /name/i });
    await user.click(nameButton); // asc
    await user.click(nameButton); // desc

    const unsortedIcon = nameButton.querySelector("svg.opacity-40");
    expect(unsortedIcon).not.toBeInTheDocument();

    const sortIcon = nameButton.querySelector("svg");
    expect(sortIcon).toBeInTheDocument();
  });
});

describe("DataTable - pagination", () => {
  it("shows pagination controls when data exceeds pageSize", () => {
    render(<DataTable columns={testColumns} data={manyItems} pageSize={5} />);

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("does not show pagination when data fits within pageSize", () => {
    render(<DataTable columns={testColumns} data={testData} pageSize={10} />);

    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
  });

  it("does not show pagination when data length equals pageSize", () => {
    const exactItems: TestItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `Item ${i + 1}`,
      value: (i + 1) * 10,
    }));

    render(<DataTable columns={testColumns} data={exactItems} pageSize={5} />);

    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it("shows only pageSize items on first page", () => {
    render(<DataTable columns={testColumns} data={manyItems} pageSize={5} />);

    const table = screen.getByRole("table");
    const tbody = within(table).getAllByRole("rowgroup")[1]!;
    const rows = within(tbody).getAllByRole("row");

    expect(rows).toHaveLength(5);
    expect(screen.getByText("Item 01")).toBeInTheDocument();
    expect(screen.getByText("Item 05")).toBeInTheDocument();
    expect(screen.queryByText("Item 06")).not.toBeInTheDocument();
  });

  it("navigates to next page", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={testColumns} data={manyItems} pageSize={5} />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    await user.click(nextButton);

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Item 06")).toBeInTheDocument();
    expect(screen.getByText("Item 10")).toBeInTheDocument();
    expect(screen.queryByText("Item 05")).not.toBeInTheDocument();
  });

  it("navigates to previous page", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={testColumns} data={manyItems} pageSize={5} />);

    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /previous/i }));

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Item 01")).toBeInTheDocument();
  });

  it("disables Previous button on first page", () => {
    render(<DataTable columns={testColumns} data={manyItems} pageSize={5} />);

    const prevButton = screen.getByRole("button", { name: /previous/i });
    expect(prevButton).toBeDisabled();
  });

  it("disables Next button on last page", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={testColumns} data={manyItems} pageSize={5} />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    await user.click(nextButton); // page 2
    await user.click(nextButton); // page 3

    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
    expect(nextButton).toBeDisabled();
  });

  it("shows remaining items on last page", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={testColumns} data={manyItems} pageSize={5} />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    await user.click(nextButton); // page 2
    await user.click(nextButton); // page 3

    const table = screen.getByRole("table");
    const tbody = within(table).getAllByRole("rowgroup")[1]!;
    const rows = within(tbody).getAllByRole("row");

    // 15 items, pages of 5 = last page has 5 items
    expect(rows).toHaveLength(5);
  });

  it("does not show pagination when loading", () => {
    render(<DataTable columns={testColumns} data={manyItems} pageSize={5} isLoading />);

    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });
});
