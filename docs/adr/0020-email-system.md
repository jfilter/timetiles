# ADR 0020: Email System Architecture

## Status

Accepted

## Context

TimeTiles sends transactional emails for authentication, account lifecycle, and data export workflows. These emails must support multiple languages, reflect site-specific branding, and work reliably across development, test, and production environments. The email system cannot depend on next-intl because emails are sent from API routes, background jobs, and Payload CMS hooks where the next-intl runtime is unavailable.

## Decision

### Provider Configuration: Nodemailer Adapter

All emails flow through Payload's `sendEmail` method, backed by `@payloadcms/email-nodemailer`. The adapter is configured per environment in `lib/config/payload-config-factory.ts`:

| Environment | Transport      | Details                                                                                   |
| ----------- | -------------- | ----------------------------------------------------------------------------------------- |
| Production  | SMTP           | Configured via `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS` |
| Development | ethereal.email | Auto-created test account, credentials cached to `.ethereal-credentials.json` and memory  |
| Test        | JSON transport | In-memory `jsonTransport: true`, no network calls                                         |

All environments share `EMAIL_FROM_ADDRESS` (default `noreply@timetiles.app`) and `EMAIL_FROM_NAME` (default `TimeTiles`).

**Reference:** `lib/config/payload-config-factory.ts`

### Template Architecture: Two Layers

Email templates are split into shared layout primitives and domain-specific builders.

**Layout primitives** (`lib/email/layout.ts`):

| Function                           | Purpose                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `emailLayout(body, t, logoUrl?)`   | Wraps body in HTML document with logo header and translated footer |
| `greeting(t, firstName?)`          | Translated greeting line (personalized or anonymous)               |
| `emailButton(href, label, color?)` | Primary action button                                              |
| `callout(content, color)`          | Colored sidebar callout box (red, green, amber, gray)              |

**Domain-specific builders** are co-located with their feature, not centralized:

| Module                           | Emails                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `lib/email/templates.ts`         | Email changed (old address notification), email verify (new address), account exists (anti-enumeration) |
| `lib/account/deletion-emails.ts` | Deletion scheduled, deletion cancelled, deletion completed                                              |
| `lib/export/emails.ts`           | Export ready, export failed                                                                             |
| `lib/collections/users.ts`       | Verify account, forgot password (via Payload `auth.verify` and `auth.forgotPassword` hooks)             |

Every builder follows the same pattern: accept data parameters and an optional `locale`, call `getEmailTranslations` to get a translator, compose HTML using layout primitives, and return a complete HTML string.

### Fire-and-Forget: safeSendEmail

`safeSendEmail` in `lib/email/send.ts` wraps `payload.sendEmail` with try/catch that logs errors via `logError` and swallows them. Callers do not need their own error handling.

This pattern is deliberate: email delivery failures should never abort the operation that triggered them. A successful password change must not roll back because the notification email failed. All call sites outside of Payload's built-in auth hooks use `safeSendEmail`.

**Reference:** `lib/email/send.ts`

### Internationalization: Independent of next-intl

Email translations use a standalone system in `lib/email/i18n.ts` that imports plain TypeScript message objects directly. This avoids any dependency on next-intl's React-based runtime.

| Component          | Location                   |
| ------------------ | -------------------------- |
| English strings    | `lib/email/messages/en.ts` |
| German strings     | `lib/email/messages/de.ts` |
| Translator factory | `lib/email/i18n.ts`        |

`getEmailTranslations(locale, defaults?)` returns an `EmailTranslator` function. The locale resolves to a supported language or falls back to `DEFAULT_LOCALE` (English). The optional `defaults` parameter injects values like `siteName` into every translation call, so templates do not need to pass `{ siteName }` to every `t()` invocation.

Interpolation uses simple `{key}` placeholder replacement via `String.replaceAll`. There is no ICU message syntax, no pluralization rules, and no nested keys. The German translations type-check against the English keys via `Record<keyof typeof en, string>`.

**Reference:** `lib/email/i18n.ts`, `lib/email/messages/en.ts`

### Branding Injection

`getEmailBranding(payload)` in `lib/email/branding.ts` reads the Branding global from Payload and returns `{ siteName, logoUrl }`. Results are cached in memory for 5 minutes to avoid a database query on every email send.

Branding flows into emails in two ways:

1. `siteName` is passed as a default to `getEmailTranslations`, making it available in every translated string via the `{siteName}` placeholder
2. `logoUrl` is passed to `emailLayout`, which renders it as a header image when present

**Reference:** `lib/email/branding.ts`

### Complete Email Catalog

| Email                       | Trigger                          | Sent By                                      |
| --------------------------- | -------------------------------- | -------------------------------------------- |
| Verify account              | User registration                | Payload `auth.verify` hook                   |
| Forgot password             | Password reset request           | Payload `auth.forgotPassword` hook           |
| Email changed (old address) | Email change                     | `change-email` API route via `safeSendEmail` |
| Verify new email            | Email change                     | `change-email` API route via `safeSendEmail` |
| Account exists              | Registration with existing email | `register` API route via `safeSendEmail`     |
| Deletion scheduled          | User requests account deletion   | `deletion-emails.ts` via `safeSendEmail`     |
| Deletion cancelled          | User cancels scheduled deletion  | `deletion-emails.ts` via `safeSendEmail`     |
| Deletion completed          | Background job executes deletion | `deletion-emails.ts` via `safeSendEmail`     |
| Export ready                | Background job completes export  | `export/emails.ts` via `safeSendEmail`       |
| Export failed               | Background job fails export      | `export/emails.ts` via `safeSendEmail`       |

All emails are HTML-only (no plain text alternative). The layout uses inline CSS for maximum email client compatibility.

## Consequences

- Nodemailer adapter means SMTP is the only supported transport. Adding Resend, SendGrid, or SES would require either swapping the adapter or adding a custom transport to nodemailer.
- Fire-and-forget simplifies call sites but means delivery failures are only visible in logs. There is no retry mechanism and no delivery status tracking.
- The standalone i18n system duplicates some strings that also exist in `messages/en.json` and `messages/de.json` (the next-intl files). This is intentional: email translations change independently and must work without React.
- The 5-minute branding cache means admin changes to site name or logo take up to 5 minutes to appear in emails. A server restart clears the cache immediately.
- Adding a new email requires: adding translation keys to both `en.ts` and `de.ts`, writing a builder function using layout primitives, and calling it via `safeSendEmail` from the appropriate route or job handler.
