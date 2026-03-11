/**
 * Reusable HTML email templates for transactional emails.
 *
 * Templates are kept in a single module so route handlers stay focused on
 * business logic instead of inlining large HTML strings.
 *
 * @module
 * @category Email
 */

/**
 * Notification sent to the **old** email address after an email change.
 */
export const buildOldEmailNotificationHtml = (firstName: string): string => `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h1>Your email address was changed</h1>
      <p>Hello${firstName ? ` ${firstName}` : ""},</p>
      <p>The email address associated with your TimeTiles account was recently changed.</p>
      <p>If you did not make this change, please contact support immediately to secure your account.</p>
    </body>
  </html>
`;

/**
 * Verification email sent to the **new** email address after an email change.
 */
export const buildVerificationEmailHtml = (verifyUrl: string, firstName: string): string => `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h1>Verify your new email address</h1>
      <p>Hello${firstName ? ` ${firstName}` : ""},</p>
      <p>You recently changed your email address on TimeTiles. Please verify your new email address by clicking the link below:</p>
      <p style="margin: 20px 0;">
        <a href="${verifyUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Verify Email
        </a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>If you didn't change your email, please contact support immediately.</p>
    </body>
  </html>
`;

/**
 * Notification sent when someone attempts to register with an email
 * that already has an account (anti-enumeration measure).
 */
export const generateAccountExistsEmailHTML = (resetUrl: string): string => `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h1>Account Registration Attempt</h1>
        <p>Hello,</p>
        <p>Someone (possibly you) tried to create a TimeTiles account with this email address.</p>
        <p>Since you already have an account, no new account was created.</p>
        <p><strong>If this was you:</strong></p>
        <ul>
          <li>You may have forgotten you already have an account</li>
          <li>If you forgot your password, you can reset it below</li>
        </ul>
        <p style="margin: 20px 0;">
          <a href="${resetUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Reset Password
          </a>
        </p>
        <p><strong>If this wasn't you:</strong></p>
        <p>You can safely ignore this email. Your account is secure and no changes were made.</p>
        <p style="margin-top: 30px; color: #666; font-size: 12px;">
          This is an automated security notification from TimeTiles.
        </p>
      </body>
    </html>
  `;
