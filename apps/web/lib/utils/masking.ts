/**
 * Provides utility functions for masking PII (Personally Identifiable Information) in logs.
 *
 * This module contains helpers for masking sensitive data like email addresses
 * to prevent PII from appearing in log files while still maintaining enough
 * information for debugging purposes.
 *
 * @category Utilities
 * @module
 */

/**
 * Masks an email address for logging purposes.
 *
 * Shows first 2 characters of local part, masks the rest.
 * Shows first 2 characters of domain, masks until TLD.
 *
 * @example
 * maskEmail("john.doe@example.com") // "jo***@ex***.com"
 * maskEmail("ab@cd.org") // "ab***@cd***.org"
 * maskEmail("x@y.io") // "***@***.io"
 */
export const maskEmail = (email: string): string => {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return "***";

  const local = email.substring(0, atIndex);
  const domain = email.substring(atIndex + 1);

  // Mask local part: show first 2 chars, then ***
  const maskedLocal = local.length > 2 ? `${local.substring(0, 2)}***` : "***";

  // Mask domain: show first 2 chars, then ***, then TLD
  const lastDotIndex = domain.lastIndexOf(".");
  if (lastDotIndex === -1) {
    // No TLD found, just mask entire domain
    return `${maskedLocal}@***`;
  }

  const domainName = domain.substring(0, lastDotIndex);
  const tld = domain.substring(lastDotIndex); // includes the dot

  const maskedDomain = domainName.length > 2 ? `${domainName.substring(0, 2)}***${tld}` : `***${tld}`;

  return `${maskedLocal}@${maskedDomain}`;
};
