/**
 * English email translation strings.
 *
 * @module
 * @category Email
 */
/* eslint-disable sonarjs/no-hardcoded-passwords -- translation keys referencing "password" are not credentials */
const en = {
  // Shared layout
  footer: "This is an automated message from {siteName}. If you have questions, please contact support.",
  greeting: "Hello {name},",
  greetingAnonymous: "Hello,",
  orCopyLink: "Or copy and paste this link into your browser:",

  // Shared button labels
  verifyEmailBtn: "Verify Email",
  resetPasswordBtn: "Reset Password",
  cancelDeletionBtn: "Cancel Deletion",
  downloadDataBtn: "Download My Data",
  tryAgainBtn: "Try Again",

  // Verify account (Payload auth)
  verifyAccountSubject: "Verify your {siteName} account",
  verifyAccountTitle: "Verify your {siteName} account",
  verifyAccountBody:
    "Thank you for registering with {siteName}. Please verify your email address by clicking the link below:",
  verifyAccountIgnore: "If you didn't create an account, you can safely ignore this email.",

  // Reset password (Payload auth)
  resetPasswordSubject: "Reset your {siteName} password",
  resetPasswordTitle: "Reset your password",
  resetPasswordBody: "You requested to reset your password. Click the link below to set a new password:",
  resetPasswordExpiry: "This link will expire in 1 hour.",
  resetPasswordIgnore: "If you didn't request a password reset, you can safely ignore this email.",

  // Email changed — old address notification
  emailChangedSubject: "Your {siteName} email address was changed",
  emailChangedTitle: "Your email address was changed",
  emailChangedBody: "The email address associated with your {siteName} account was recently changed.",
  emailChangedWarning: "If you did not make this change, please contact support immediately to secure your account.",

  // Email changed — new address verification
  emailVerifySubject: "Verify your new {siteName} email address",
  emailVerifyTitle: "Verify your new email address",
  emailVerifyBody:
    "You recently changed your email address on {siteName}. Please verify your new email address by clicking the link below:",
  emailVerifyWarning: "If you didn't change your email, please contact support immediately.",

  // Account exists (anti-enumeration)
  accountExistsSubject: "{siteName} - Account Registration Attempt",
  accountExistsTitle: "Account Registration Attempt",
  accountExistsBody: "Someone (possibly you) tried to create a {siteName} account with this email address.",
  accountExistsExplain: "Since you already have an account, no new account was created.",
  accountExistsIfYou: "If this was you:",
  accountExistsForgot: "You may have forgotten you already have an account",
  accountExistsReset: "If you forgot your password, you can reset it below",
  accountExistsIfNot: "If this wasn't you:",
  accountExistsIgnore: "You can safely ignore this email. Your account is secure and no changes were made.",

  // Deletion scheduled
  deletionScheduledSubject: "Your {siteName} account deletion is scheduled",
  deletionScheduledTitle: "Account Deletion Scheduled",
  deletionScheduledBody: "Your {siteName} account deletion has been scheduled.",
  deletionScheduledDate: "Deletion Date:",
  deletionScheduledNext: "What happens next?",
  deletionScheduledPublic: "Public data will be transferred to the system and remain accessible",
  deletionScheduledPrivate: "Private data will be permanently deleted on the scheduled date",
  deletionScheduledCancel: "You can cancel this deletion anytime before the scheduled date",
  deletionScheduledWarning:
    "If you didn't request this deletion, please cancel it immediately and secure your account.",
  deletionScheduledLink: "Or visit your account settings:",

  // Deletion cancelled
  deletionCancelledSubject: "Your {siteName} account deletion has been cancelled",
  deletionCancelledTitle: "Account Deletion Cancelled",
  deletionCancelledBody: "Good news! Your {siteName} account deletion has been cancelled.",
  deletionCancelledActive: "Your account is now <strong>active</strong> and all your data is safe.",
  deletionCancelledWarning:
    "If you didn't cancel this deletion, someone may have access to your account. We recommend:",
  deletionCancelledChangePassword: "Changing your password immediately",
  deletionCancelledReviewActivity: "Reviewing your recent account activity",

  // Deletion completed
  deletionCompletedSubject: "Your {siteName} account has been deleted",
  deletionCompletedTitle: "Your {siteName} Account Has Been Deleted",
  deletionCompletedBody: "Your {siteName} account has been permanently deleted as scheduled.",
  deletionCompletedSummary: "Summary of Changes",
  deletionCompletedTransferred: "Public Data Transferred",
  deletionCompletedTransferredNote: "This data remains publicly accessible.",
  deletionCompletedDeleted: "Private Data Deleted",
  deletionCompletedDeletedNote: "This data has been permanently removed.",
  deletionCompletedCatalogs: "{count} catalog(s)",
  deletionCompletedDatasets: "{count} dataset(s)",
  deletionCompletedEvents: "{count} event(s)",
  deletionCompletedPrivateCatalogs: "{count} private catalog(s)",
  deletionCompletedPrivateDatasets: "{count} private dataset(s)",
  deletionCompletedThanks:
    "Thank you for using {siteName}. If you have any questions about your data, please contact support within 30 days.",

  // Export ready
  exportReadySubject: "Your {siteName} data export is ready",
  exportReadyTitle: "Your Data Export is Ready",
  exportReadyBody: "Good news! Your {siteName} data export has been completed and is ready for download.",
  exportReadyDetails: "Export Details",
  exportReadySize: "Size:",
  exportReadyExpires: "Expires:",
  exportReadySettings: "Or visit your account settings:",
  exportReadyIncludes: "What's included?",
  exportReadyProfile: "Your profile information",
  exportReadyCatalogs: "All catalogs you've created",
  exportReadyDatasets: "All datasets and their configurations",
  exportReadyEvents: "All events in your datasets",
  exportReadyImports: "Import history and scheduled ingests",
  exportReadyMedia: "Media files you've uploaded",
  exportReadyExpiry:
    "This download link will expire in 7 days. After that, you'll need to request a new export from your account settings.",
  exportReadySecurityWarning:
    "If you didn't request this export, please secure your account by changing your password.",

  // Export failed
  exportFailedSubject: "Your {siteName} data export could not be completed",
  exportFailedTitle: "Data Export Failed",
  exportFailedBody:
    "Unfortunately, we couldn't complete your data export. This may be due to a temporary technical issue.",
  exportFailedError: "Error:",
  exportFailedActions: "What you can do:",
  exportFailedRetry: "Visit your account settings and try again",
  exportFailedContact: "If the problem persists, please contact support",
  exportFailedApology: "We apologize for the inconvenience.",

  // Scheduled ingest disabled — shared
  editScheduleBtn: "Open schedule settings",
  scheduledIngestLabel: "Schedule:",
  scheduledIngestTypeLabel: "Type:",
  scheduledIngestErrorLabel: "Error:",

  // Scheduled ingest — invalid config
  scheduledIngestConfigInvalidSubject: 'Your scheduled import "{name}" was disabled (invalid configuration)',
  scheduledIngestConfigInvalidTitle: "Scheduled import disabled",
  scheduledIngestConfigInvalidBody:
    'We couldn\'t parse the schedule configuration for your import "{name}", so it has been disabled to prevent further failed runs.',
  scheduledIngestConfigInvalidAction: "Please fix the schedule configuration and re-enable the import.",

  // Scheduled ingest — retries exhausted
  scheduledIngestRetriesExhaustedSubject: 'Your scheduled import "{name}" was disabled (too many failures)',
  scheduledIngestRetriesExhaustedTitle: "Scheduled import disabled",
  scheduledIngestRetriesExhaustedBody:
    'Your scheduled import "{name}" failed {currentRetries} time(s) in a row (max: {maxRetries}) and has been disabled.',
  scheduledIngestRetriesExhaustedAction:
    "Review the error below and re-enable the import once the underlying problem is resolved.",
} as const;

export default en;
