/**
 * Static navigation config for each wizard step.
 *
 * Steps that need only static config (no dynamic loading state, no custom
 * onNext handler) are declared here. Steps with dynamic config (e.g.,
 * step-review with isLoading) still use `setNavigationConfig` at runtime.
 *
 * @module
 * @category Components
 */
import type { NavigationConfig } from "./navigation-config-context";
import type { WizardStep } from "./wizard-context";

/**
 * Default navigation config per step. Missing entries fall through
 * to the defaults in wizard-context (showBack: true, showNext: true).
 */
export const STEP_NAV_CONFIGS: Partial<Record<WizardStep, NavigationConfig>> = {
  1: { showBack: false, showNext: false }, // Auth — no navigation buttons
  6: { showBack: false, showNext: false }, // Processing — no navigation buttons
  // Steps 2-4 use the default config (showBack: true, showNext: true)
  // Step 5 (Review) sets its config dynamically via setNavigationConfig
};
