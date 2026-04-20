# ADR 0019: Internationalization (i18n) Architecture

## Status

Accepted

## Context

TimeTiles serves users in multiple languages. The frontend, Payload CMS admin dashboard, and transactional emails all need localized content, but each operates in a different runtime context (browser, server component, background job). A unified approach would be ideal, but practical constraints -- next-intl depends on the Next.js request lifecycle, while emails are sent from API routes and background jobs with no request context -- require two separate translation systems that share the same locale list.

## Decision

### Two Translation Systems, One Locale Registry

All locale definitions originate from `i18n/config.ts`:

```typescript
export const SUPPORTED_LOCALES = ["en", "de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = (process.env.DEFAULT_LOCALE || "en") satisfies Locale;
```

The `DEFAULT_LOCALE` environment variable lets deployments change the default without a code change.

| System     | Runtime                              | Used By                                    | Message Files                                          |
| ---------- | ------------------------------------ | ------------------------------------------ | ------------------------------------------------------ |
| next-intl  | Next.js request lifecycle            | Frontend pages, React components           | `messages/en.json`, `messages/de.json`                 |
| Email i18n | Standalone (no framework dependency) | API routes, background jobs, Payload hooks | `lib/email/messages/en.ts`, `lib/email/messages/de.ts` |

### Frontend: next-intl with App Router

All frontend routes live under `app/[locale]/(frontend)/`. The integration has four parts:

**1. Routing** (`i18n/routing.ts`): Defines the `localePrefix: "as-needed"` strategy. The default locale has no URL prefix (`/explore`); non-default locales get a prefix (`/de/explore`).

**2. Middleware** (`middleware.ts`): Detects the user's locale and redirects as needed. Detection order:

1. URL path prefix (explicit: `/de/explore`)
2. `NEXT_LOCALE` cookie (set by next-intl when the user switches language)
3. `Accept-Language` header (browser preference)
4. Falls back to `DEFAULT_LOCALE`

The middleware matcher excludes paths that should not be locale-routed:

```
/((?!api|dashboard|_next|_vercel|.*\..*).*)
```

This keeps API routes (`/api/*`), the Payload admin dashboard (`/dashboard/*`), Next.js internals (`/_next/*`), and static files out of the locale system.

**3. Request config** (`i18n/request.ts`): Called on every server-rendered request. Resolves the locale from the request and dynamically imports the matching message file.

**4. Client provider** (`app/[locale]/(frontend)/layout.tsx`): The root frontend layout wraps children in `NextIntlClientProvider`, passing the resolved messages so client components can call `useTranslations()`.

```typescript
// Server component (layout)
const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
return (
  <html lang={locale}>
    <body>
      <NextIntlClientProvider messages={messages}>
        {children}
      </NextIntlClientProvider>
    </body>
  </html>
);
```

**Using translations in components:**

```typescript
// Client or server component
import { useTranslations } from "next-intl";

const t = useTranslations("Events");
t("noEventsFound"); // "No events found"
t("selected", { count: 3 }); // "3 selected"
```

**Locale-aware navigation:** Import `Link`, `redirect`, `usePathname`, and `useRouter` from `@/i18n/navigation` instead of `next/link` and `next/navigation`. These automatically handle locale prefixing.

### Message File Organization

Frontend messages (`messages/en.json`, `messages/de.json`) use a flat namespace structure:

| Namespace     | Scope                                             |
| ------------- | ------------------------------------------------- |
| `Common`      | Shared UI labels (loading, cancel, save, filters) |
| `Auth`        | Sign in, sign up, password reset                  |
| `VerifyEmail` | Email verification flow                           |
| `Explore`     | Map and explore page                              |
| `Filters`     | Filter panel and controls                         |
| `Events`      | Event display and detail                          |
| `Account`     | Account settings pages                            |
| `DataExport`  | Data export flow                                  |
| `Import`      | Import wizard                                     |
| `Schedules`   | Scheduled imports                                 |
| `Scrapers`    | Scraper management                                |
| `Header`      | Top navigation bar                                |
| `NotFound`    | 404 page                                          |

Keys use ICU message format for interpolation: `"selected": "{count} selected"`.

### Payload CMS Localization

Payload is configured with matching locales in `lib/config/payload-config-factory.ts`:

```typescript
localization: {
  locales: [
    { label: "English", code: "en" },
    { label: "Deutsch", code: "de" },
  ],
  defaultLocale: "en",
  fallback: true,
}
```

This enables locale-aware content in Payload globals (Branding, Footer, MainMenu) and any collection fields marked as `localized: true`. The `fallback: true` setting means Payload returns English content when a German translation is missing.

The `i18n.supportedLanguages` config separately localizes the Payload admin dashboard UI itself (field labels, buttons, navigation).

### Email i18n: Independent System

Emails are sent from API routes, Payload hooks, and background jobs -- contexts where the next-intl request lifecycle is unavailable. A lightweight standalone translator in `lib/email/i18n.ts` handles this:

```typescript
const t = getEmailTranslations("de", { siteName: "TimeTiles" });
t("greeting", { name: "Max" }); // "Hallo Max,"
t("footer"); // "Dies ist eine automatische Nachricht von TimeTiles..."
```

The user's preferred locale is stored as a `locale` field on the Users collection (`select` field, defaults to `"en"`). When sending an email, callers pass the user's stored locale:

```typescript
const t = getEmailTranslations(user.locale, { siteName: branding.siteName });
await queueEmail(payload, {
  to: user.email,
  subject: t("emailChangedSubject"),
  html: buildOldEmailNotificationHtml(user.firstName, user.locale, branding),
});
```

Email message files (`lib/email/messages/en.ts`, `lib/email/messages/de.ts`) are TypeScript objects rather than JSON. The German file is typed against the English keys (`Record<keyof typeof en, string>`) so a missing translation is a compile-time error.

### Why API Routes and Dashboard Are Excluded

API routes return JSON, not localized HTML. Locale-prefixing API paths would break client integrations and complicate webhook URLs. The Payload admin dashboard has its own i18n system (`i18n.supportedLanguages` in Payload config) and its own URL space (`/dashboard`). Running either through the next-intl middleware would cause redirect loops or incorrect path resolution.

### Adding a New Locale

1. Add the locale code to `SUPPORTED_LOCALES` in `i18n/config.ts`
2. Create `messages/{locale}.json` with all namespaces translated
3. Create `lib/email/messages/{locale}.ts` typed against the English keys
4. Import and register the email messages in `lib/email/i18n.ts`
5. Add the locale to Payload's `localization.locales` array in `payload-config-factory.ts`
6. Add the locale to the `locale` field options in the Users collection (`lib/collections/users.ts`)
7. Run `pnpm payload:migrate:create` if the Users field change requires a migration

## Consequences

- The `as-needed` prefix strategy keeps English URLs clean (no `/en/` prefix), which is good for SEO and link sharing, but means the default locale is implicit rather than explicit
- Two translation systems (next-intl + email i18n) require maintaining parallel message files, but the email system is intentionally small (~130 keys) and typed, so drift is caught at compile time
- The user's stored `locale` preference drives email language independently of the URL they happen to be visiting, which is correct for asynchronous notifications
- Payload's `fallback: true` means partially translated content still renders (in English) rather than showing blank fields, at the cost of silently mixing languages
- Adding a new locale requires changes in seven locations, which is a coordination cost but ensures nothing is missed
