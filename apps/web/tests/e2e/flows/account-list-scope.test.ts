/**
 * Personal schedule lists retain their owner filter after a real mutation/refetch.
 *
 * @module
 * @category E2E Tests
 */
import { TEST_CREDENTIALS, TEST_EMAILS } from "../../constants/test-credentials";
import { expect, test } from "../fixtures";

test("Account schedule owner scope survives refetch", async ({ page }) => {
  const api = page.request;
  const me = await api.get("/api/users/me");
  const user = (await me.json()).user;
  expect(user?.role).toBe("admin");
  const suffix = crypto.randomUUID();
  const cleanup: string[] = [];
  const createDoc = async (collection: string, data: Record<string, unknown>): Promise<number> => {
    const response = await api.post(`/api/${collection}`, { data });
    expect(response.status()).toBe(201);
    const id = (await response.json()).doc.id as number;
    cleanup.unshift(`/api/${collection}/${id}`);
    return id;
  };

  try {
    const otherUserId = await createDoc("users", {
      email: TEST_EMAILS.admin.replace("@", `+schedule-owner-${suffix}@`),
      password: `${TEST_CREDENTIALS.basic.strongPassword}-${suffix}`,
      _verified: true,
    });
    const catalog = await createDoc("catalogs", { name: `Owner scope ${suffix}`, isPublic: true });
    const ownName = `Own schedule ${suffix}`;
    const otherName = `Other schedule ${suffix}`;
    const scheduleData = {
      catalog,
      enabled: false,
      scheduleType: "frequency",
      frequency: "daily",
      sourceUrl: "https://example.com/events.csv",
    };
    await createDoc("scheduled-ingests", { ...scheduleData, name: ownName, createdBy: user.id });
    const otherId = await createDoc("scheduled-ingests", { ...scheduleData, name: otherName, createdBy: otherUserId });

    // Prove this admin can read the other owner's record: absence from the UI
    // must come from the personal-list filter, not restricted collection access.
    expect((await api.get(`/api/scheduled-ingests/${otherId}`)).ok()).toBe(true);
    await page.goto("/account/imports?tab=scheduled");
    const ownRow = page.getByRole("row").filter({ hasText: ownName });
    await expect(ownRow).toBeVisible();
    await expect(page.getByText(otherName, { exact: true })).not.toBeVisible();

    await ownRow.getByRole("button", { name: "Actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const refreshed = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/scheduled-ingests" && response.request().method() === "GET";
    });
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    const response = await refreshed;
    expect(response.ok()).toBe(true);
    expect(new URL(response.url()).searchParams.get("where[createdBy][equals]")).toBe(String(user.id));
    expect((await response.json()).docs.some((doc: { id: number }) => doc.id === otherId)).toBe(false);
    await expect(ownRow).not.toBeVisible();
    await expect(page.getByText(otherName, { exact: true })).not.toBeVisible();
  } finally {
    for (const url of cleanup) {
      const response = await api.delete(url);
      expect(response.ok() || response.status() === 404).toBe(true);
    }
  }
});
