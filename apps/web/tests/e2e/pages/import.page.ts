/**
 * Page object for the import wizard.
 *
 * @module
 * @category E2E Page Objects
 */
import type { Locator, Page } from "@playwright/test";

export class ImportPage {
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
    this.backButton = page
      .locator('[data-testid="wizard-navigation"] button:text-matches("Back|Previous", "i"), button:text-is("Back")')
      .first();
    this.nextButton = page
      .locator(
        '[data-testid="wizard-navigation"] button:text-matches("Continue|Next", "i"), button:text-is("Continue")'
      )
      .first();
    this.startImportButton = page.getByRole("button", { name: /Start Import|Import/i });
  }

  /**
   * Navigate to the import wizard page.
   * Clears localStorage to ensure wizard starts fresh.
   */
  async goto(): Promise<void> {
    // Clear localStorage first by going to any page on the domain
    await this.page.goto("/import", { timeout: 10000 });
    await this.page.waitForLoadState("domcontentloaded");

    // Clear wizard draft from localStorage to ensure clean state
    await this.page.evaluate(() => {
      localStorage.removeItem("timetiles_import_wizard_draft");
    });

    // Wait for page to settle (don't reload - it breaks login flow)
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Wait for the wizard to be fully loaded.
   */
  async waitForWizardLoad(): Promise<void> {
    // Wait for the page to be fully interactive
    await this.page.waitForLoadState("domcontentloaded");
    // Wait a bit for React to hydrate
    await this.page.waitForTimeout(500);
  }

  /**
   * Login with provided credentials.
   * After successful login, the page reloads automatically and advances to upload step.
   */
  async login(email: string, password: string): Promise<void> {
    // Wait for page to fully render and check current state
    const signInHeading = this.page.getByRole("heading", { name: /sign in to continue/i });
    const uploadHeading = this.page.getByRole("heading", { name: /upload your data/i });

    // Wait for either sign-in or upload heading to be visible (with timeout)
    const maxInitialWait = 10000;
    const startInitialWait = Date.now();
    let onAuthStep = false;
    let onUploadStep = false;

    while (Date.now() - startInitialWait < maxInitialWait) {
      onAuthStep = await signInHeading.isVisible().catch(() => false);
      onUploadStep = await uploadHeading.isVisible().catch(() => false);

      if (onAuthStep || onUploadStep) {
        break;
      }
      await this.page.waitForTimeout(200);
    }

    // If already on upload step, we're done
    if (onUploadStep) {
      return;
    }

    // If not on auth step and not on upload step, something is wrong
    if (!onAuthStep) {
      const pageContent = await this.page.content();
      throw new Error(
        `Login failed: Page is not showing auth step or upload step. ` +
          `Page content includes: ${pageContent.substring(0, 500)}`
      );
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
      this.page.waitForResponse((resp) => resp.url().includes("/api/users/login"), { timeout: 5000 }),
      this.loginButton.click(),
    ]);

    // Check if login API returned success
    const status = response.status();
    if (status !== 200) {
      const body = await response.text().catch(() => "");
      throw new Error(`Login API failed with status ${status}: ${body}`);
    }

    // Wait for the upload heading to appear (wizard advances after client-side auth check)
    const maxWaitTime = 15000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const uploadVisible = await uploadHeading.isVisible().catch(() => false);
      if (uploadVisible) {
        return; // Success!
      }
      await this.page.waitForTimeout(500);
    }

    // Get current page state for better error message
    const currentUrl = this.page.url();
    const stillOnAuth = await this.page
      .getByRole("heading", { name: /sign in to continue/i })
      .isVisible()
      .catch(() => false);
    throw new Error(
      `Login timed out after ${maxWaitTime}ms. ` + `URL: ${currentUrl}, Still on auth step: ${stillOnAuth}`
    );
  }

  /**
   * Upload a file to the wizard.
   */
  async uploadFile(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
    // Wait for file to be processed
    await this.page.waitForTimeout(1000);
  }

  /**
   * Select an existing catalog.
   */
  async selectCatalog(catalogName: string): Promise<void> {
    await this.catalogSelect.click();
    await this.page.getByRole("option", { name: catalogName }).click();
  }

  /**
   * Create a new catalog.
   */
  async createNewCatalog(catalogName: string): Promise<void> {
    await this.catalogSelect.click();
    await this.page.getByRole("option", { name: /New Catalog/i }).click();
    await this.newCatalogInput.fill(catalogName);
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
   * Get the current step number.
   */
  async getCurrentStep(): Promise<number> {
    const activeStep = await this.page
      .locator('[data-testid^="progress-step-"][data-active="true"]')
      .getAttribute("data-testid");
    if (!activeStep) return 0;
    const match = /progress-step-(\d+)/.exec(activeStep);
    return match?.[1] ? parseInt(match[1], 10) : 0;
  }

  /**
   * Click the next button to proceed.
   */
  async clickNext(): Promise<void> {
    await this.nextButton.click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Click the back button to go to previous step.
   */
  async clickBack(): Promise<void> {
    await this.backButton.click();
    await this.page.waitForTimeout(500);
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
