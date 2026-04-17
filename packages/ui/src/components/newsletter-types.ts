/**
 * Public newsletter component types.
 *
 * Keeps externally consumed newsletter prop types separate from the
 * internal shared newsletter implementation helpers.
 *
 * @module
 * @category Components
 */

/** Labels for the submit button in different states. */
export interface NewsletterButtonLabels {
  submitting?: string;
  submitted?: string;
}
