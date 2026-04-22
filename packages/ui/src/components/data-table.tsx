/**
 * Reusable data table built on @tanstack/react-table.
 *
 * Purely presentational: accepts column definitions and data,
 * renders with sorting, pagination, expandable rows, and loading/empty states.
 *
 * @module
 * @category Components
 */
"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Header,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Fragment, type ReactNode, useCallback, useState } from "react";

import { Button } from "./button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

interface DataTableProps<TData, TValue> {
  readonly columns: ColumnDef<TData, TValue>[];
  readonly data: TData[];
  readonly isLoading?: boolean;
  readonly loadingRowCount?: number;
  readonly emptyState?: ReactNode;
  readonly pageSize?: number;
  readonly className?: string;
  /** Render expanded content below a row. Presence enables the expand chevron column. */
  readonly renderExpandedRow?: (row: TData) => ReactNode;
  /** Custom row ID extractor for stable expand state. Defaults to row index. */
  readonly getRowId?: (row: TData) => string;
}

const SortIndicator = ({ direction }: { readonly direction: false | "asc" | "desc" }) => {
  if (direction === "asc") return <ArrowUpIcon className="ml-1 inline h-3.5 w-3.5" />;
  if (direction === "desc") return <ArrowDownIcon className="ml-1 inline h-3.5 w-3.5" />;
  return <ArrowUpDownIcon className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
};

const SkeletonRow = ({ colCount }: { readonly colCount: number }) => (
  <TableRow>
    {Array.from({ length: colCount }, (_, i) => (
      <TableCell key={i}>
        <div className="bg-muted h-4 animate-pulse rounded" />
      </TableCell>
    ))}
  </TableRow>
);

const HeaderCell = <TData, TValue>({ header }: { readonly header: Header<TData, TValue> }) => {
  if (header.isPlaceholder) return null;

  if (header.column.getCanSort()) {
    return (
      <button
        type="button"
        className="inline-flex cursor-pointer items-center select-none"
        onClick={header.column.getToggleSortingHandler()}
      >
        {flexRender(header.column.columnDef.header, header.getContext())}
        <SortIndicator direction={header.column.getIsSorted()} />
      </button>
    );
  }

  return <>{flexRender(header.column.columnDef.header, header.getContext())}</>;
};

const DataTable = <TData, TValue>({
  columns,
  data,
  isLoading = false,
  loadingRowCount = 5,
  emptyState,
  pageSize = 10,
  className,
  renderExpandedRow,
  getRowId: getRowIdProp,
}: DataTableProps<TData, TValue>) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((rowId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    getRowId: getRowIdProp ? (row) => getRowIdProp(row) : undefined,
  });

  const pageCount = table.getPageCount();
  const { pageIndex } = table.getState().pagination;
  const showPagination = !isLoading && data.length > pageSize;
  const totalColSpan = columns.length + (renderExpandedRow ? 1 : 0);

  return (
    <div className={cn("space-y-4", className)}>
      <Table role={renderExpandedRow ? "treegrid" : undefined}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {renderExpandedRow && <TableHead className="w-8" />}
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  <HeaderCell header={header} />
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: loadingRowCount }, (_, i) => <SkeletonRow key={i} colCount={totalColSpan} />)
            : table.getRowModel().rows.map((row) => {
                const isExpanded = expandedRows.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className={renderExpandedRow ? "cursor-pointer" : undefined}
                      onClick={renderExpandedRow ? () => toggleRow(row.id) : undefined}
                      aria-expanded={renderExpandedRow ? isExpanded : undefined}
                      tabIndex={renderExpandedRow ? 0 : undefined}
                      onKeyDown={
                        renderExpandedRow
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleRow(row.id);
                              }
                            }
                          : undefined
                      }
                    >
                      {renderExpandedRow && (
                        <TableCell className="w-8 px-2">
                          <ChevronRightIcon className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
                        </TableCell>
                      )}
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                    {renderExpandedRow && isExpanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={totalColSpan} className="bg-muted/30 p-4">
                          {renderExpandedRow(row.original)}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
          {!isLoading && table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={totalColSpan} className="h-24 text-center">
                {emptyState ?? <span className="text-muted-foreground">No results.</span>}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {showPagination && (
        <div className="flex items-center justify-between px-2">
          <span className="text-muted-foreground text-sm">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export { DataTable };
export type { DataTableProps };
export { type ColumnDef } from "@tanstack/react-table";
