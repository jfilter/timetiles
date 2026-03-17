/**
 * Shared HTML email layout wrapper.
 *
 * Provides consistent styling and structure for all transactional emails.
 * All email templates should use {@link emailLayout} to wrap their body content
 * and {@link emailFooter} for the standard footer line.
 *
 * @module
 * @category Email
 */

/** Standard greeting line. */
export const greeting = (firstName?: string | null): string => `<p>Hello${firstName ? ` ${firstName}` : ""},</p>`;

/** Primary action button. */
export const emailButton = (href: string, label: string, color = "#0070f3"): string =>
  `<p style="margin: 30px 0;">
    <a href="${href}" style="background-color: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
      ${label}
    </a>
  </p>`;

/** Colored sidebar callout box. */
export const callout = (content: string, color: "red" | "green" | "amber" | "gray"): string => {
  const colors = {
    red: { bg: "#fef2f2", border: "#dc2626" },
    green: { bg: "#f0fdf4", border: "#16a34a" },
    amber: { bg: "#fef3c7", border: "#f59e0b" },
    gray: { bg: "#f3f4f6", border: "#6b7280" },
  };
  const { bg, border } = colors[color];
  return `<div style="background-color: ${bg}; border-left: 4px solid ${border}; padding: 16px; margin: 20px 0;">${content}</div>`;
};

/** Horizontal divider + footer text. */
export const emailFooter = (text: string): string =>
  `<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #999; font-size: 12px;">${text}</p>`;

/**
 * Wrap email body content in the standard HTML layout.
 *
 * @param body - Inner HTML content (everything between the body tags)
 * @returns Complete HTML document string
 */
export const emailLayout = (body: string): string =>
  `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    ${body}
  </body>
</html>`;
