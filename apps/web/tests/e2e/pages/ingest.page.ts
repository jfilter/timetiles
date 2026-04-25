/**
 * Page object for the import wizard.
 *
 * @module
 * @category E2E Page Objects
 */
import { expect, type Locator, type Page } from "@playwright/test";

export class IngestPage {
  readonly page: Page;

  // Page header
  readonly pageHeading: Locator;

  // Progress indicator
  readonly progressIndicator: Locator;
  readonly progressSteps: Locator;

  // Auth step elements
  readonly authStep: Locator;
  readonly loginTab: Locator;
  readonly registerTab: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly registerButton: Locator;

  // Upload step elements
  readonly uploadStep: Locator;
  readonly dropZone: Locator;
  readonly fileInput: Locator;
  readonly uploadedFileName: Locator;

  // Dataset selection step elements
  readonly datasetSelectionStep: Locator;
  readonly catalogSelect: Locator;
  readonly newCatalogInput: Locator;
  readonly datasetSelect: Locator;
  readonly newDatasetInput: Locator;

  // Field mapping step elements
  readonly fieldMappingStep: Locator;
  readonly titleFieldSelect: Locator;
  readonly dateFieldSelect: Locator;
  readonly locationFieldSelect: Locator;
  readonly dataPreviewTable: Locator;

  // Review step elements
  readonly reviewStep: Locator;
  readonly reviewSummary: Locator;
  readonly geocodingToggle: Locator;
  readonly deduplicationSelect: Locator;

  // Processing step elements
  readonly processingStep: Locator;
  readonly progressBar: Locator;
  readonly completionMessage: Locator;
  readonly errorMessage: Locator;

  // Navigation buttons
  readonly backButton: Locator;
  readonly nextButton: Locator;
  readonly startImportButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header
    this.pageHeading = page.getByRole("heading", { name: /Import|Data Import/i });

    // Progress indicator
    this.progressIndicator = page.locator('[data-testid="wizard-progress"]');
    this.progressSteps = page.locator('[data-testid^="progress-step-"]');

    // Auth step
    this.authStep = page.locator('[data-testid="step-auth"]');
    this.loginTab = page.getByRole("tab", { name: /Login|Sign In/i });
    this.registerTab = page.getByRole("tab", { name: /Register|Sign Up/i });
    this.emailInput = page.getByLabel(/Email/i);
    this.passwordInput = page.getByLabel(/Password/i).first();
    this.loginButton = page.getByRole("button", { name: /Login|Sign In/i });
    this.registerButton = page.getByRole("button", { name: /Register|Sign Up/i });

    // Upload step
    this.uploadStep = page.locator('[data-testid="step-upload"]');
    this.dropZone = page.locator('[data-testid="drop-zone"]');
    this.fileInput = page.locator('input[type="file"]');
    this.uploadedFileName = page.locator('[data-testid="uploaded-file-name"]');

    // Dataset selection step
    this.datasetSelectionStep = page.locator('[data-testid="step-dataset-selection"]');
    this.catalogSelect = page.getByLabel(/Catalog/i);
    this.newCatalogInput = page.getByLabel(/New Catalog Name/i);
    this.datasetSelect = page.getByLabel(/Dataset/i);
    this.newDatasetInput = page.getByLabel(/New Dataset Name/i);

    // Field mapping step
    this.fieldMappingStep = page.locator('[data-testid="step-field-mapping"]');
    this.titleFieldSelect = page.getByLabel(/Title Field/i);
    this.dateFieldSelect = page.getByLabel(/Date Field/i);
    this.locationFieldSelect = page.getByLabel(/Location/i);
    this.dataPreviewTable = page.locator('[data-testid="data-preview-table"]');

    // Review step
    this.reviewStep = page.locator('[data-testid="step-review"]');
    this.reviewSummary = page.locator('[data-testid="review-summary"]');
    this.geocodingToggle = page.getByLabel(/Geocoding/i);
    this.deduplicationSelect = page.getByLabel(/Deduplication/i);

    // Processing step
    this.processingStep = page.locator('[data-testid="step-processing"]');
    this.progressBar = page.locator('[data-testid="progress-bar"]');
    this.completionMessage = page.getByText(/complete|success/i);
    this.errorMessage = page.locator('[data-testid="error-message"]');

    // Navigation buttons - use data-testid to avoid matching Next.js dev tools
    this.backButton = page.getByRole("button", { name: /^Back/i }).first();
    this.nextButton = page.getByRole("button", { name: /^Continue/i }).first();
    this.startImportButton = page.getByRole("button", { name: /Start Import|Import/i });
  }

  /**
   * Navigate to the import wizard page.
   * Clears localStorage to ensure wizard starts fresh.
   */
  async goto(): Promise<void> {
    // Use waitUntil: "domcontentloaded" to avoid waiting for i18n middleware
    // to fully resolve all resources (the middleware intercepts all frontend routes)
    await this.page.goto("/ingest", { timeout: 30000, waitUntil: "domcontentloaded" });

    // Clear wizard draft from localStorage to ensure clean state
    await this.page.evaluate(() => {
      localStorage.removeItem("timetiles-wizard-v2");
    });

    // Wait for wizard UI to render (auth heading or upload heading)
    const signInHeading = this.page.getByRole("heading", { name: /sign in to continue/i });
    const uploadHeading = this.page.getByRole("heading", { name: /upload your data/i });
    await signInHeading.or(uploadHeading).waitFor({ state: "visible", timeout: 15000 });
  }

  /**
   * Wait for the wizard to be fully loaded.
   */
  async waitForWizardLoad(): Promise<void> {
    // Wait for the page to be fully interactive
    await this.page.waitForLoadState("domcontentloaded");
    // Wait for wizard UI to be interactive (either auth form or upload form)
    // Use longer timeout to account for i18n middleware processing
    const signInHeading = this.page.getByRole("heading", { name: /sign in to continue/i });
    const uploadHeading = this.page.getByRole("heading", { name: /upload your data/i });
    await signInHeading.or(uploadHeading).waitFor({ state: "visible", timeout: 15000 });
  }

  /**
   * Login with provided credentials.
   * After successful login, the page reloads automatically and advances to upload step.
   */
  async login(email: string, password: string): Promise<void> {
    // Wait for page to fully render and check current state
    const signInHeading = this.page.getByRole("heading", { name: /sign in to continue/i });
    const uploadHeading = this.page.getByRole("heading", { name: /upload your data/i });

    // Wait for either sign-in or upload heading to be visible
    await signInHeading
      .or(uploadHeading)
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(async () => {
        const pageContent = await this.page.content();
        throw new Error(
          `Login failed: Page is not showing auth step or upload step. ` +
            `Page content includes: ${pageContent.substring(0, 500)}`
        );
      });

    // If already on upload step, we're done
    if (await uploadHeading.isVisible().catch(() => false)) {
      return;
    }

    // Click on sign in tab if visible
    const signInTab = this.page.getByRole("tab", { name: /Sign In/i });
    if (await signInTab.isVisible().catch(() => false)) {
      await signInTab.click();
    }

    // Wait for form to be ready
    await this.emailInput.waitFor({ state: "visible", timeout: 5000 });

    // Fill login form
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    // Click login button and wait for API response
    const [response] = await Promise.all([
      this.page.waitForResponse((resp) => resp.url().includes("/api/auth/login"), { timeout: 5000 }),
      this.loginButton.click(),
    ]);

    // Check if login API returned success
    const status = response.status();
    if (status !== 200) {
      const body = await response.text().catch(() => "");
      throw new Error(`Login API failed with status ${status}: ${body}`);
    }

    // After login the wizard shows an explicit "You're signed in / Continue"
    // step (no auto-advance — users must confirm before moving on). Click
    // that Continue button when present, then wait for the upload step.
    const signedInContinue = this.page.getByRole("button", { name: /^Continue$/i });
    await signedInContinue.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
      // Skip if the wizard already moved to upload on its own.
    });
    if (await signedInContinue.isVisible().catch(() => false)) {
      await signedInContinue.click();
    }

    await uploadHeading.waitFor({ state: "visible", timeout: 15000 }).catch(async () => {
      const currentUrl = this.page.url();
      const stillOnAuth = await this.page
        .getByRole("heading", { name: /sign in to continue/i })
        .isVisible()
        .catch(() => false);
      throw new Error(`Login timed out after 15000ms. URL: ${currentUrl}, Still on auth step: ${stillOnAuth}`);
    });
  }

  /**
   * Upload a file to the wizard.
   */
  async uploadFile(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
    // Wait for file processing to complete — "File ready for import" or sheet detection
    // Allow 20s for schema detection (involves API call + background processing)
    await this.page
      .getByText(/file ready for import|sheets? detected/i)
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
  }

  /**
   * Select an existing catalog.
   */
  async selectCatalog(catalogName: string): Promise<void> {
    await this.catalogSelect.click();
    await this.page.getByRole("option", { name: catalogName }).click();
  }

  /**
   * Create a new catalog with the given name.
   * Handles both cases: when no catalogs exist (input shown directly)
   * and when catalogs exist (must select "+ Create new catalog" first).
   *
   * If the dataset-suggestion banner is visible (server detected a similar
   * existing dataset), dismiss it via "Ignore" so we land on the manual
   * catalog form. The applied banner is unreachable here because this
   * helper never clicks "Use this config".
   *
   * Waits for the catalog API to finish loading before interacting,
   * since isVisible() checks immediately without waiting.
   */
  async createNewCatalog(catalogName: string): Promise<void> {
    const catalogDropdown = this.page.locator("#catalog-select");
    const catalogNameInput = this.page.locator("#new-catalog-name");

    // Dismiss the dataset-suggestion banner if it's visible — the test wants
    // a fresh catalog, not the server's match.
    const ignoreButton = this.page
      .locator('[data-testid="dataset-suggestion-banner"]')
      .getByRole("button", { name: /ignore/i });
    if (await ignoreButton.isVisible().catch(() => false)) {
      await ignoreButton.click();
    }

    // Wait for the loading spinner to disappear and the form to render.
    const formReady = catalogDropdown.or(catalogNameInput);
    await expect(formReady).toBeVisible({ timeout: 10000 });

    // Check if the catalog dropdown is visible (existing catalogs exist)
    if (await catalogDropdown.isVisible()) {
      // Use native select if it's a <select>, otherwise use Radix Select pattern
      const tagName = await catalogDropdown.evaluate((el) => el.tagName.toLowerCase());
      if (tagName === "select") {
        await catalogDropdown.selectOption("new");
      } else {
        // Radix Select — click trigger, then click the "new" option
        await catalogDropdown.click();
        await this.page.getByRole("option", { name: /create new catalog/i }).click();
      }
      await expect(catalogNameInput).toBeVisible({ timeout: 5000 });
    }

    // The catalog name input should now be visible
    await expect(catalogNameInput).toBeVisible({ timeout: 5000 });
    await catalogNameInput.clear();
    await catalogNameInput.fill(catalogName);
  }

  /**
   * Select an existing dataset.
   */
  async selectDataset(datasetName: string): Promise<void> {
    await this.datasetSelect.click();
    await this.page.getByRole("option", { name: datasetName }).click();
  }

  /**
   * Create a new dataset.
   */
  async createNewDataset(datasetName: string): Promise<void> {
    await this.datasetSelect.click();
    await this.page.getByRole("option", { name: /New Dataset/i }).click();
    await this.newDatasetInput.fill(datasetName);
  }

  /**
   * Configure field mapping.
   */
  async configureFieldMapping(options: { title?: string; date?: string; location?: string }): Promise<void> {
    if (options.title) {
      await this.titleFieldSelect.click();
      await this.page.getByRole("option", { name: options.title }).click();
    }
    if (options.date) {
      await this.dateFieldSelect.click();
      await this.page.getByRole("option", { name: options.date }).click();
    }
    if (options.location) {
      await this.locationFieldSelect.click();
      await this.page.getByRole("option", { name: options.location }).click();
    }
  }

  /**
   * Select a value in a Radix UI Select component by its trigger locator.
   * Retries the click→select cycle if the dropdown closes unexpectedly
   * (Radix portals can take time to mount in CI).
   */
  async selectFieldValue(triggerLocator: Locator, value: string): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await triggerLocator.click();
      const option = this.page.getByRole("option", { name: value, exact: true });
      try {
        await expect(option).toBeVisible({ timeout: 5000 });
        await option.click();
        // Verify the dropdown closed and value was set
        await expect(option).not.toBeVisible({ timeout: 2000 });
        return;
      } catch {
        if (attempt === maxAttempts)
          throw new Error(`selectFieldValue: failed to select "${value}" after ${maxAttempts} attempts`);
        // Dismiss any open dropdown before retrying
        await this.page.keyboard.press("Escape");
        await expect(option)
          .not.toBeVisible({ timeout: 1000 })
          .catch(() => {});
      }
    }
  }

  /**
   * Get the currently displayed text of a Radix UI Select trigger.
   */
  async getFieldValue(triggerLocator: Locator): Promise<string> {
    return (await triggerLocator.textContent())?.trim() ?? "";
  }

  /**
   * Wait for the field mapping form to be interactive.
   * Checks that the title field select trigger is visible (Radix UI mounted).
   * Use after navigating to field mapping step or switching sheet tabs.
   */
  async waitForFieldMappingReady(): Promise<void> {
    // Column-centric mapping table — wait for first target select to be visible
    const firstTargetSelect = this.page.locator("select[aria-label]").first();
    await expect(firstTargetSelect).toBeVisible({ timeout: 10000 });
    await expect(firstTargetSelect).toBeEnabled({ timeout: 5000 });
  }

  /**
   * Get the current step number.
   */
  async getCurrentStep(): Promise<number> {
    const activeStep = await this.page
      .locator('[data-testid^="progress-step-"][data-active="true"]')
      .getAttribute("data-testid");
    if (!activeStep) return 0;
    const match = /progress-step-(\d+)/.exec(activeStep);
    return match?.[1] ? Number.parseInt(match[1], 10) : 0;
  }

  /**
   * Click the next button to proceed.
   */
  async clickNext(): Promise<void> {
    await this.nextButton.click();
    await this.page.waitForLoadState("domcontentloaded");
  }

  /**
   * Click the back button to go to previous step.
   */
  async clickBack(): Promise<void> {
    await this.backButton.click();
    await this.page.waitForLoadState("domcontentloaded");
  }

  /**
   * Start the import process.
   */
  async startImport(): Promise<void> {
    await this.startImportButton.click();
  }

  /**
   * Wait for import to complete.
   */
  async waitForImportComplete(timeout = 10000): Promise<void> {
    await this.completionMessage.waitFor({ state: "visible", timeout });
  }

  /**
   * Check if there's an error.
   */
  async hasError(): Promise<boolean> {
    return this.errorMessage.isVisible();
  }

  /**
   * Get error message text.
   */
  async getErrorMessage(): Promise<string | null> {
    if (await this.hasError()) {
      return this.errorMessage.textContent();
    }
    return null;
  }
}
