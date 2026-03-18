/**
 * Sanitizes user-provided CSS to prevent injection attacks.
 *
 * Strips dangerous patterns while preserving legitimate CSS.
 * Used for custom CSS injection in the Sites customCode feature.
 *
 * @module
 * @category Utils
 */

/** Patterns that are stripped from custom CSS for security. */
const DANGEROUS_PATTERNS = [
  // External resource loading
  /@import\b/gi,
  /url\s*\(/gi,
  // Script injection
  /javascript\s*:/gi,
  /expression\s*\(/gi,
  /behavior\s*:/gi,
  /-moz-binding\s*:/gi,
  // Data exfiltration
  /@charset\b/gi,
  /@namespace\b/gi,
  // Full-page overlay attacks
  /position\s*:\s*fixed/gi,
  // HTML/script injection via CSS
  /<\s*\/?script/gi,
  /<\s*\/?style/gi,
  /<\s*\/?link/gi,
];

/**
 * Sanitize user-provided CSS by removing dangerous patterns.
 *
 * @param css - Raw CSS string from the CMS
 * @returns Sanitized CSS string safe for injection
 */
export const sanitizeCSS = (css: string): string => {
  let sanitized = css;
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, "/* removed */");
  }
  return sanitized;
};
