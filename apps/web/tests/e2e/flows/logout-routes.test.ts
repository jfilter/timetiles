/**
 * Logout routes must clear the browser cookie, not just a server-side session.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";

test.describe("Logout routes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ["/logout", "/dashboard/logout"]) {
    test(`clears the browser session via ${route}`, async ({ page, context, ownUser }) => {
      const login = await page.request.post("/api/auth/login", {
        data: { email: ownUser.email, password: ownUser.password },
      });
      expect(login.ok()).toBe(true);
      expect((await context.cookies()).some((cookie) => cookie.name === "payload-token")).toBe(true);

      await page.goto(route);

      await expect
        .poll(async () => (await context.cookies()).some((cookie) => cookie.name === "payload-token"))
        .toBe(false);
      const currentUser = await page.request.get("/api/users/me");
      expect((await currentUser.json()).user).toBeNull();
    });
  }
});
