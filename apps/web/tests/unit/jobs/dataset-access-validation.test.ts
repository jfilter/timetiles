/**
 * Unit tests for the dataset-access gate in dataset detection.
 *
 * The job only carries the ingest file's owner ID, so the role has to be looked
 * up before rejecting: configure-service lets an admin target a foreign private
 * catalog, and without the lookup that admin's own import failed here.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

import { validateDatasetAccessForUser } from "@/lib/jobs/handlers/dataset-detection/catalog-dataset-helpers";
import type { Dataset } from "@/payload-types";

const OWNER_ID = 42;
const STRANGER_ID = 99;

const dataset = { id: 5, catalog: 3 } as unknown as Dataset;

/** Payload stub whose catalog is private and owned by someone else. */
const createPayload = (role: string) => ({
  findByID: vi.fn(({ collection }: { collection: string }) =>
    collection === "catalogs"
      ? Promise.resolve({ id: 3, isPublic: false, createdBy: STRANGER_ID })
      : Promise.resolve({ id: OWNER_ID, role })
  ),
});

describe.sequential("validateDatasetAccessForUser", () => {
  it("rejects a plain user targeting a foreign private catalog", async () => {
    const payload = createPayload("user");

    await expect(validateDatasetAccessForUser(payload as never, dataset, OWNER_ID)).rejects.toThrow(
      /does not have access/
    );
  });

  it.each(["admin", "editor"])("allows a %s, matching validateCatalogOwnership", async (role) => {
    const payload = createPayload(role);

    await expect(validateDatasetAccessForUser(payload as never, dataset, OWNER_ID)).resolves.toBeUndefined();
  });

  it("allows anyone into a public catalog without looking up the role", async () => {
    const payload = { findByID: vi.fn().mockResolvedValue({ id: 3, isPublic: true, createdBy: STRANGER_ID }) };

    await expect(validateDatasetAccessForUser(payload as never, dataset, OWNER_ID)).resolves.toBeUndefined();
    expect(payload.findByID).toHaveBeenCalledTimes(1);
  });
});
