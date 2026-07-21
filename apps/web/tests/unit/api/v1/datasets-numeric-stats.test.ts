/**
 * Unit tests for the numeric-stats API route.
 *
 * Two contracts the route previously broke:
 *
 * 1. It advertised a range slider for every path in detection's
 *    `fieldTypes.number`, falling back to a US number format when the column had
 *    no number-kind plan policy. The query path does the opposite:
 *    `resolveDatasetFieldContext` deletes exactly those keys from `rf` and
 *    `buildRangeFilterConditions` skips them, so the filter was accepted, shown
 *    as active in the UI, and never applied.
 * 2. It built ONE shared WHERE clause from the full query (including `rf`) and
 *    reused it for every field's MIN/MAX, so a field's reported bounds were
 *    constrained by its own range filter — dragging a handle progressively
 *    collapsed that slider's own domain.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn(), mockFindByID: vi.fn(), mockExecute: vi.fn() }));

vi.mock("@/lib/middleware/auth", () => ({}));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/datasets/[id]/numeric-stats/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

/**
 * Collect every bound parameter value out of a drizzle `sql` fragment.
 *
 * `queryChunks` interleaves StringChunks (whose `value` is an array of literal
 * SQL strings), nested fragments (which carry their own `queryChunks`), and the
 * bound values themselves as bare primitives.
 */
const collectParams = (node: unknown, out: unknown[] = []): unknown[] => {
  if (node === null || typeof node !== "object") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectParams(item, out);
    return out;
  }
  const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) collectParams(chunk, out);
    return out;
  }
  const value = (node as { value?: unknown }).value;
  // StringChunk: literal SQL text, not a bound parameter.
  if (value !== undefined && !Array.isArray(value)) out.push(value);
  return out;
};

const fieldMeta = (paths: string[]) =>
  Object.fromEntries(paths.map((path) => [path, { path, isEnumCandidate: false, isTagField: false }]));

/** A plan whose `columns` give `price` (and optionally more) a number policy. */
const planWithNumberColumns = (fields: string[]) => ({
  columns: fields.map((field) => ({
    field,
    kind: "number",
    policy: { kind: "number", decimalSeparator: ".", thousandsSeparator: null },
  })),
});

const DATASET_ID = 5;

const createRequest = (queryString = "") => {
  const url = `http://localhost:3000/api/v1/datasets/${DATASET_ID}/numeric-stats${queryString}`;
  return { user: null, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

const callRoute = (queryString = "") =>
  GET(createRequest(queryString), { params: Promise.resolve({ id: String(DATASET_ID) }) });

describe.sequential("GET /api/v1/datasets/[id]/numeric-stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockExecute.mockResolvedValue({ rows: [{ min: 1, max: 100, is_integer: true }] });
    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: null }),
      findByID: mocks.mockFindByID,
      db: { drizzle: { execute: mocks.mockExecute } },
    });
  });

  it("omits fields whose column has no number-kind policy — the event endpoints drop their range filter", async () => {
    // `qty` is classified numeric by detection but has no plan policy, so
    // `projectNumberFormats` omits it and every event endpoint silently
    // discards a `qty` range filter. Advertising a slider for it offers a
    // control that does nothing.
    mocks.mockFindByID.mockResolvedValue({
      id: DATASET_ID,
      fieldMetadata: fieldMeta(["price", "qty"]),
      fieldTypes: { number: ["price", "qty"] },
      interpretationPlan: planWithNumberColumns(["price"]),
    });

    const response = await callRoute();
    const body = await response.json();

    expect(body.fields.map((f: { path: string }) => f.path)).toEqual(["price"]);
    expect(mocks.mockExecute).toHaveBeenCalledTimes(1);
  });

  it("returns no fields when no numeric column has a resolved format", async () => {
    mocks.mockFindByID.mockResolvedValue({
      id: DATASET_ID,
      fieldMetadata: fieldMeta(["price"]),
      fieldTypes: { number: ["price"] },
      interpretationPlan: { columns: [] },
    });

    const response = await callRoute();
    const body = await response.json();

    expect(body.fields).toEqual([]);
    expect(mocks.mockExecute).not.toHaveBeenCalled();
  });

  it("excludes a field's own range filter from its bounds query but keeps the others", async () => {
    mocks.mockFindByID.mockResolvedValue({
      id: DATASET_ID,
      fieldMetadata: fieldMeta(["price", "qty"]),
      fieldTypes: { number: ["price", "qty"] },
      interpretationPlan: planWithNumberColumns(["price", "qty"]),
    });

    // Distinctive bounds so each filter is identifiable in the emitted params.
    const rf = encodeURIComponent(JSON.stringify({ price: { min: 111 }, qty: { min: 222 } }));
    await callRoute(`?rf=${rf}`);

    expect(mocks.mockExecute).toHaveBeenCalledTimes(2);

    // The aggregate expression binds the measured field path as the query's
    // FIRST parameter, so it identifies which field each call is for.
    const byMeasuredPath = new Map<unknown, unknown[]>(
      mocks.mockExecute.mock.calls.map((call) => {
        const params = collectParams(call[0]);
        return [params[0], params];
      })
    );

    // price's own lower bound must NOT constrain price's domain, but qty's must.
    const priceParams = byMeasuredPath.get("price")!;
    expect(priceParams).not.toContain(111);
    expect(priceParams).toContain(222);

    // ...and symmetrically for qty.
    const qtyParams = byMeasuredPath.get("qty")!;
    expect(qtyParams).not.toContain(222);
    expect(qtyParams).toContain(111);
  });

  it("returns an empty field list for a dataset with no fieldMetadata", async () => {
    mocks.mockFindByID.mockResolvedValue({ id: DATASET_ID, fieldMetadata: null });

    const response = await callRoute();

    expect((await response.json()).fields).toEqual([]);
  });

  it("404s for a dataset the caller cannot read", async () => {
    mocks.mockFindByID.mockResolvedValue(null);

    const response = await callRoute();

    expect(response.status).toBe(404);
  });
});
