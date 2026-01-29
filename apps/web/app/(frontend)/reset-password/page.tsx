/**
 * Reset password page for setting a new password using a reset token.
 *
 * Server component that renders the reset password content.
 * Does not require authentication since the user is resetting their password.
 *
 * @module
 * @category Pages
 */
import { ResetPasswordContent } from "./_components/reset-password-content";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return <ResetPasswordContent />;
}
