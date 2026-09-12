/**
 * Logout routes must clear the browser cookie, not just a server-side session.
 *
 * @module
 * @category E2E Tests
 */
import { TEST_CREDENTIALS, TEST_EMAILS } from "../../constants/test-credentials";
import { expect, test } from "../fixtures";

test.describe("Logout routes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ["/logout", "/dashboard/logout"]) {
    test(`clears the browser session via ${route}`, async ({ page, context, playwright, baseURL }) => {
      // Each logout owns its user: concurrent logins to the seed admin can
      // overwrite Payload's session list and invalidate another test's cookie.
      const admin = await playwright.request.newContext({ baseURL, storageState: "test-results/.auth/admin.json" });
      const email = TEST_EMAILS.admin.replace("@", `+logout-${crypto.randomUUID()}@`);
      const password = `${TEST_CREDENTIALS.basic.strongPassword}-${crypto.randomUUID()}`;
      let userId: number | undefined;
      try {
        const created = await admin.post("/api/users", { data: { email, password, role: "admin", _verified: true } });
        expect(created.status()).toBe(201);
        userId = (await created.json()).doc.id;
        const login = await page.request.post("/api/auth/login", { data: { email, password } });
        expect(login.ok()).toBe(true);
        expect((await context.cookies()).some((cookie) => cookie.name === "payload-token")).toBe(true);

        await page.goto(route);

        await expect
          .poll(async () => (await context.cookies()).some((cookie) => cookie.name === "payload-token"))
          .toBe(false);
        const currentUser = await page.request.get("/api/users/me");
        expect((await currentUser.json()).user).toBeNull();
      } finally {
        if (userId != null) {
          const deleted = await admin.delete(`/api/users/${userId}`);
          expect(deleted.ok()).toBe(true);
        }
        await admin.dispose();
      }
    });
  }
});
