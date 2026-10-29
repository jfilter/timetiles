/**
 * E2E tests for basic explore page functionality.
 *
 * Tests core navigation, UI elements, and basic interactions
 * on the explore page.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";
import { showExplorerSurface } from "../pages/responsive-layout";

test.describe("Explore Page - Basic Functionality", () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto();
  });

  test("should load the explore page with all components", async () => {
    // Check main components are visible
    await expect(explorePage.map).toBeVisible();
    // Datasets collapsible section trigger should be visible
    await expect(explorePage.dataSourcesSection).toBeVisible();

    // Dataset/catalog checkboxes should be present (data loaded from API)
    await expect(explorePage.datasetCheckboxes.first()).toBeVisible();

    // The map's first software-rendered frame can block the page; switch views once it has loaded.
    await explorePage.waitForMapSettled();

    // Should show events count (now a paragraph with "Showing X events...")
    await explorePage.show("list");
    await expect(explorePage.eventsCount).toBeVisible();
  });

  test("should load the map properly", async () => {
    await explorePage.waitForMapLoad();

    // Check map container has proper dimensions
    const mapBox = await explorePage.map.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.width).toBeGreaterThan(300);
    expect(mapBox!.height).toBeGreaterThan(300);

    // Check that map has loaded by verifying the map container has proper attributes
    await expect(explorePage.map).toHaveAttribute("role", "region");
    await expect(explorePage.map).toHaveAttribute("aria-label", "Map");
  });

  test("should render the empty state when a date filter matches no events", async ({ page }) => {
    // A far-future date window matches nothing in the seed data, so the empty
    // state is deterministic rather than dependent on the map viewport.
    await page.goto("/explore?lat=0&lng=0&zoom=1&startDate=2099-01-01&endDate=2099-12-31", {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });
    await explorePage.show("map");
    await explorePage.map.waitFor({ state: "visible", timeout: 15000 });
    await explorePage.waitForEventsToLoad();

    // The empty-state copy must actually render...
    await explorePage.show("list");
    await expect(explorePage.noEventsMessage).toBeVisible({ timeout: 15000 });
    // ...and no event cards may be left on screen.
    await expect(page.getByTestId("event-card")).toHaveCount(0);
    expect(await explorePage.getEventCount()).toBe(0);
  });

  test("should render events instead of the empty state when data matches", async ({ page }) => {
    // Global view so the seeded, globally-scattered events fall inside the viewport.
    await explorePage.goto({ globalView: true });
    await explorePage.waitForEventsToLoad();
    await explorePage.waitForEventsLoaded(1);

    // With data present the empty state must NOT be shown...
    await expect(explorePage.noEventsMessage).toBeHidden();
    // ...and real event cards must be rendered.
    await expect(page.getByTestId("event-card").first()).toBeVisible({ timeout: 15000 });
    expect(await explorePage.getEventCount()).toBeGreaterThan(0);
  });

  test("should have responsive layout", async ({ page }) => {
    const viewTabs = page.getByRole("tablist", { name: "View options" });
    const mapWidth = async () => (await explorePage.map.boundingBox())?.width ?? 0;

    // Desktop view - side by side; the layout follows a media query, so wait for it to switch
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(viewTabs).toBeHidden();

    // Map should take roughly 40% of width (adjusted based on actual layout)
    await expect.poll(mapWidth).toBeGreaterThanOrEqual(1200 * 0.35);
    expect(await mapWidth()).toBeLessThan(1200 * 0.6);

    // Mobile view - map, chart and list become tabs and the map spans the viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(viewTabs).toBeVisible();
    await explorePage.show("map");
    await expect.poll(mapWidth).toBeGreaterThanOrEqual(375 * 0.9);
  });

  test("should persist state in URL", async ({ page }) => {
    // Initial URL should contain /explore path (may include map state params)
    const initialUrl = new URL(page.url());
    expect(initialUrl.pathname).toBe("/explore");

    // Global view keeps the seeded events inside the map bounds, like the other catalog-selection tests
    await explorePage.goto({ globalView: true });
    await explorePage.waitForMapLoad();

    // Select all datasets in a catalog (tri-state checkbox)
    await explorePage.selectAllInCatalog("Environmental Data");

    // URL should have datasets parameter after selecting datasets
    const url = new URL(page.url());
    expect(url.searchParams.has("datasets")).toBe(true);
  });

  test("should operate the dataset filters with the keyboard", async ({ page, browserName }) => {
    // The timeline re-renders once the map reports bounds, which would drop focus mid-walk.
    // Leave the beforeEach page first so its in-flight request cannot satisfy the wait, and
    // subscribe before navigating so a fast response is not missed.
    await page.goto("about:blank");
    const boundedTimeline = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return url.pathname === "/api/v1/events/temporal" && url.searchParams.has("bounds");
      },
      { timeout: 60000 }
    );
    await explorePage.goto();
    await boundedTimeline;
    await explorePage.waitForTimelineReady();
    const datasetsTrigger = explorePage.dataSourcesSection;
    await expect(datasetsTrigger).toBeVisible();

    // The filter panel is the last region in the DOM, so walking backwards from the last
    // tabbable element reaches it without crossing every event card. Starting from <body>
    // does not work everywhere: Firefox leaves the document on Shift+Tab from there.
    // Stop on wrap (body or a revisited element).
    await page.evaluate(() => {
      const tabbables = document.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      [...tabbables]
        .reverse()
        .find((el) => el.offsetParent !== null)
        ?.focus();
    });
    // macOS WebKit tabs to form fields only; Option+Tab is Safari's path to every element.
    const backwardTab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Shift+Tab" : "Shift+Tab";
    let reached = false;
    let wrapped = false;
    for (let presses = 0; presses < 200 && !reached && !wrapped; presses++) {
      await page.keyboard.press(backwardTab);
      reached = await datasetsTrigger.evaluate((el) => el === document.activeElement);
      wrapped = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body || active.hasAttribute("data-tab-visited")) return true;
        active.setAttribute("data-tab-visited", "");
        return false;
      });
    }
    expect(reached).toBe(true);
    await expect(datasetsTrigger).toBeFocused();

    // Enter and Space toggle the collapsible section
    const initiallyExpanded = await datasetsTrigger.getAttribute("aria-expanded");
    const toggled = initiallyExpanded === "true" ? "false" : "true";
    await page.keyboard.press("Enter");
    await expect(datasetsTrigger).toHaveAttribute("aria-expanded", toggled);
    await page.keyboard.press("Space");
    await expect(datasetsTrigger).toHaveAttribute("aria-expanded", initiallyExpanded ?? "true");

    // Space on a focused catalog checkbox changes its checked state
    const catalogCheckbox = explorePage.catalogButtons.first();
    await expect(catalogCheckbox).toBeVisible();
    await catalogCheckbox.focus();
    await expect(catalogCheckbox).toBeFocused();
    const initiallyChecked = await catalogCheckbox.getAttribute("aria-checked");
    await page.keyboard.press("Space");
    await expect(catalogCheckbox).not.toHaveAttribute("aria-checked", initiallyChecked ?? "false");
  });

  test("should show loading state while fetching events", async ({ page }) => {
    // The skeleton is driven by isInitialLoad in map-explorer.tsx, which stays
    // true until BOTH the events-list query and the map-cluster query have
    // data. The cluster query is disabled until MapLibre reports bounds, so
    // when it even starts depends on WebGL map init — measured at ~16s in a CI
    // container. Any wall-clock budget here would silently encode how fast the
    // map happens to be, so this test drives both gates explicitly instead.

    // Hold the events-list response open rather than delaying it by a fixed
    // amount, so "while fetching" is a state this test controls, not a race.
    // Matches useEventsListQuery exactly, which calls /api/v1/events?<params>.
    // Using a RegExp instead of a glob because Playwright's `?` in globs is a
    // single-char wildcard — "events?**" also matches /events/bounds?…,
    // /events/geo?…, /events/temporal?…, and stalls unrelated queries.
    const eventsListRoute = /\/api\/v1\/events\?[^/]*$/;
    let releaseEventsResponse!: () => void;
    const eventsResponseReleased = new Promise<void>((resolve) => {
      releaseEventsResponse = resolve;
    });

    await page.route(eventsListRoute, async (route) => {
      await eventsResponseReleased;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: [], pagination: { totalDocs: 0, limit: 1000, page: 1 } }),
      });
    });

    // Registered before navigating: waitForResponse only observes responses
    // that arrive after the call, so subscribing later would miss a fast
    // cluster response and then wait for a second one that never comes.
    const clustersLoaded = page.waitForResponse((response) => response.url().includes("/api/v1/events/geo"), {
      timeout: 60000,
    });

    await page.goto("/explore", { waitUntil: "domcontentloaded" });

    const skeleton = page.getByTestId("events-list-skeleton");

    // Skeleton must be up while the list request is genuinely in flight
    await page.waitForRequest(eventsListRoute, { timeout: 60000 });
    await expect(skeleton).toBeVisible();

    // Clear the second gate before the first, so the assertion below measures
    // only the skeleton reacting to the release — not map initialization.
    await clustersLoaded;
    releaseEventsResponse();

    // And disappear once both queries have data
    await expect(skeleton).toBeHidden({ timeout: 10000 });
  });
});

test.describe("Explore Page - Without WebGL", () => {
  test("should explain that the map cannot start instead of loading forever", async ({ page }) => {
    await page.addInitScript(() => {
      const canvas = HTMLCanvasElement.prototype;
      canvas.getContext = new Proxy(Reflect.get(canvas, "getContext"), {
        apply: (target, thisArg, args: [string, ...unknown[]]) =>
          args[0].startsWith("webgl") ? null : Reflect.apply(target, thisArg, args),
      });
    });
    await page.goto("/explore", { waitUntil: "domcontentloaded" });
    await showExplorerSurface(page, "map");

    const alert = page.getByRole("alert").filter({ hasText: "The map can't be displayed" });
    await expect(alert).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Loading map data...")).toBeHidden();
  });
});
