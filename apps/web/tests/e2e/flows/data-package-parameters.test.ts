/**
 * Native browser validation for data package activation parameters.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";

test("data package activation requires declared parameters in the browser", async ({ page }) => {
  await page.goto("/account/data-packages");
  await page.waitForLoadState("domcontentloaded");

  const heading = page.getByRole("heading", { name: "UCDP Conflict Events — {{country}} (HDX)", exact: true });
  const card = page
    .locator("div")
    .filter({ has: heading })
    .filter({ has: page.getByRole("button", { name: "Activate", exact: true }) })
    .last();
  await card.getByRole("button", { name: "Activate", exact: true }).click();

  const dialog = page.getByRole("dialog");
  const country = dialog.getByLabel("Country name");
  await expect(country).toHaveAttribute("required", "");
  await expect(dialog.getByLabel("HDX dataset UUID")).toHaveAttribute("required", "");
  await expect(dialog.getByLabel("HDX resource UUID")).toHaveAttribute("required", "");

  const activationRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/data-packages/ucdp-hdx/activate")) {
      activationRequests.push(request.url());
    }
  });
  await dialog.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(country).toBeFocused();
  await expect(dialog).toBeVisible();
  expect(activationRequests).toHaveLength(0);

  await country.fill("Myanmar");
  await dialog.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(dialog.getByLabel("HDX dataset UUID")).toBeFocused();
  expect(activationRequests).toHaveLength(0);
});
