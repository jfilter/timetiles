# ADR 0013: Account Management and User Lifecycle

## Status

Accepted

## Context

TimeTiles is a multi-tenant platform where users own catalogs, datasets, events, and other resources. The platform needs a complete account lifecycle: registration, credential management, data portability, and account deletion with proper handling of shared data. These operations are security-sensitive and must resist enumeration attacks, prevent privilege escalation, and comply with data portability expectations. This ADR documents the full user lifecycle, building on the authentication and authorization foundations in ADR 0002.

## Decision

### Registration

Self-registration is gated by the `enableRegistration` feature flag, checked via `isFeatureEnabled()` at the start of the registration endpoint. When disabled, the endpoint returns 403.

Source: `app/api/auth/register/route.ts`

**Anti-enumeration**: The endpoint returns an identical success response (`"Please check your email to verify your account."`) regardless of whether the email is new or already registered. For existing accounts, a notification email is sent with a password reset link instead of a verification email. This prevents attackers from discovering valid email addresses.

**Privilege escalation prevention**: The `beforeChange` hook on the `users` collection forces safe defaults for self-registrants:

| Field                | Forced Value  | Condition                                                          |
| -------------------- | ------------- | ------------------------------------------------------------------ |
| `role`               | `"user"`      | `operation === "create" && !req.user && req.payloadAPI === "REST"` |
| `trustLevel`         | `"1"` (BASIC) | Same                                                               |
| `registrationSource` | `"self"`      | Same                                                               |
| `isActive`           | `true`        | Same                                                               |

The `req.payloadAPI === "REST"` check ensures only public HTTP requests are restricted. Local API calls (tests, seeding, system operations) bypass the restriction and can create admin users.

Source: `lib/collections/users.ts` (`hooks.beforeChange`)

**Email verification**: Payload's built-in `auth.verify` generates a verification email with a tokenized link to `/verify-email?token=...`. The email states the link expires in 24 hours.

Source: `lib/collections/users.ts` (`auth.verify`)

**Rate limits**: Registration has strict multi-window rate limiting per client IP:

| Window | Limit        |
| ------ | ------------ |
| Burst  | 3 per minute |
| Hourly | 10 per hour  |
| Daily  | 20 per day   |

### Password Management

**Password reset** (forgot password): Payload's built-in `auth.forgotPassword` sends an email with a tokenized link to `/reset-password?token=...`. The token expires in 1 hour (Payload default). The email is configured in `lib/collections/users.ts` (`auth.forgotPassword`).

**Password change** (authenticated): `POST /api/account/change-password` requires the user to re-verify their current password via `payload.login()` before the new password is accepted. This prevents session hijacking from being silently escalated to a credential takeover.

Source: `app/api/account/change-password/route.ts`

Validations:

- Minimum 8 characters (`MIN_PASSWORD_LENGTH`)
- Current password verified via `payload.login()` (returns 401 on failure)
- Rate limited per user ID via `RATE_LIMITS.PASSWORD_CHANGE` (3/min, 10/hr, 20/day)

### Email Change

`POST /api/account/change-email` allows authenticated users to change their email address.

Source: `app/api/account/change-email/route.ts`

The endpoint enforces:

| Check                    | Behavior                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| Password re-verification | `payload.login()` with current credentials                         |
| Format validation        | Regex check for valid email syntax                                 |
| Same-email rejection     | Returns 400 if new email matches current                           |
| Uniqueness check         | Queries `users` collection; returns 400 if email is already in use |
| Rate limiting            | `RATE_LIMITS.EMAIL_CHANGE` (3/min, 5/hr, 10/day) per user ID       |

The email is updated directly via `payload.update()`. The new email is normalized to lowercase and trimmed before storage.

### Account Deletion

Account deletion uses a grace-period model: the user requests deletion, a 7-day window allows cancellation, and a background job executes the actual deletion after the window expires.

Source: `app/api/account/delete/route.ts`, `lib/services/account-deletion-service.ts`

**Request flow** (`POST /api/account/delete`):

1. Rate limit check (`RATE_LIMITS.ACCOUNT_DELETION`: 3/hr, 5/day)
2. Password re-verification via `payload.login()`; separate rate limit on password attempts (`RATE_LIMITS.DELETION_PASSWORD_ATTEMPTS`: 5/min, 10/hr)
3. Pre-deletion checks via `canDeleteUser()`:
   - Cannot delete the system user (`system@timetiles.internal`)
   - Cannot delete an already-deleted user
   - Cannot delete the last admin (counts remaining admins excluding pending-deletion)
   - Cannot delete a user with active import jobs (non-completed, non-failed)
4. Sets `deletionStatus: "pending_deletion"`, `deletionRequestedAt`, and `deletionScheduledAt` (now + 7 days)
5. Sends a confirmation email with a link to cancel

**Cancellation** (`POST /api/account/delete/cancel`):

Authenticated users with `deletionStatus === "pending_deletion"` can cancel. The service resets the user to `deletionStatus: "active"` and clears the scheduled date. A cancellation confirmation email is sent.

Source: `app/api/account/delete/cancel/route.ts`

**Execution** (background job `execute-account-deletion`):

The job runs periodically, queries users where `deletionStatus === "pending_deletion"` and `deletionScheduledAt <= now`, and processes each:

| Step                  | Action                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Transfer public data  | Public catalogs and datasets are reassigned to the system user (see below)                                                  |
| Delete private data   | Private datasets and their events are deleted, then private catalogs                                                        |
| Delete user resources | Scheduled imports, import files, views, and data exports are deleted                                                        |
| Anonymize PII         | Email replaced with `deleted-{id}-{timestamp}@deleted.timetiles.internal`; first/last name cleared; `isActive` set to false |
| Invalidate sessions   | Direct SQL delete on `users_sessions` for the user ID                                                                       |
| Audit log             | Immutable record created in `deletion-audit-log` collection                                                                 |

Source: `lib/jobs/handlers/execute-account-deletion-job.ts`, `lib/services/account-deletion-service.ts` (`executeDeletion`)

A completion email with transfer/deletion summary is sent to the original email address before anonymization.

**Audit log** (`audit-log` collection):

Immutable records of all sensitive actions across the platform. No one can create, update, or delete via the API (all access returns `false`; records are created only via `overrideAccess: true` through the `AuditLogService`). Common fields include `action` type, `userId`, SHA-256 hashed email, raw IP address (cleared after 30 days by background job), permanent IP hash, timestamp, and a `details` JSON field for action-specific data.

Tracked action domains:

| Domain      | Actions                                                                                                                        | Source                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `account.*` | `email_changed`, `password_changed`, `deletion_scheduled`, `deletion_cancelled`, `deletion_executed`, `password_verify_failed` | API routes (`app/api/account/`)                   |
| `admin.*`   | `trust_level_changed`, `role_changed`, `user_activated`, `user_deactivated`, `custom_quotas_changed`, `quota_overridden`       | Users collection `afterChange` hook               |
| `data.*`    | `catalog_visibility_changed`, `dataset_visibility_changed`, `catalog_ownership_transferred`, `dataset_ownership_transferred`   | Collection `afterChange` hooks + deletion service |
| `system.*`  | `feature_flag_changed`, `settings_changed`                                                                                     | Settings global `afterChange` hook                |
| `import.*`  | `job_stage_override`, `scheduled_import_admin_modified`                                                                        | Import collection `afterChange` hooks             |

The `auditFieldChanges` utility in `audit-log-service.ts` provides a reusable pattern for detecting field-level diffs in Payload `afterChange` hooks and emitting audit entries for each changed field.

Source: `lib/collections/audit-log.ts`, `lib/services/audit-log-service.ts`

### Data Export

`POST /api/account/download-data` requests an asynchronous data export. `GET /api/account/download-data` lists the user's export history (last 10).

Source: `app/api/account/download-data/route.ts`

The endpoint:

1. Checks rate limit (`RATE_LIMITS.DATA_EXPORT`: 1/hr, 3/day)
2. Rejects if a pending or processing export already exists (409 Conflict)
3. Creates a `data-exports` record with status `"pending"`
4. Queues the `data-export` background job
5. Returns 202 Accepted with an export summary

The `data-export` job collects all user data (catalogs, datasets, events, media, scheduled imports, import jobs, import files), packages it into a ZIP archive with JSON files (events chunked at 10,000 per file), and stores the file on disk. The export record is updated to `"ready"` with a 7-day expiry (`EXPORT_EXPIRY_MS`). An email notification with a download link is sent.

Source: `lib/jobs/handlers/data-export-job.ts`, `lib/services/data-export-service.ts`

**Download** (`GET /api/account/download-data/[exportId]`):

Authenticated, ownership-verified (or admin). Checks export status and expiry, streams the ZIP file, and increments a download counter. Expired exports return 410 Gone.

Source: `app/api/account/download-data/[exportId]/route.ts`

### Trust Level Progression

Six trust levels control resource quotas (see ADR 0002 for the full quota table):

| Level | Name       | Default For                         |
| ----- | ---------- | ----------------------------------- |
| 0     | Untrusted  | Flagged or suspicious accounts      |
| 1     | Basic      | Self-registered users               |
| 2     | Regular    | Admin-promoted (collection default) |
| 3     | Trusted    | Admin-promoted                      |
| 4     | Power User | Admin-promoted                      |
| 5     | Unlimited  | Administrators                      |

Source: `lib/constants/quota-constants.ts` (`TRUST_LEVELS`, `DEFAULT_QUOTAS`)

The `trustLevel` field has `access.update` restricted to admins only. There is no automated promotion path; all trust level changes require admin action via the Payload dashboard or API.

When a trust level changes, the `beforeChange` hook auto-populates the `quotas` group fields from `DEFAULT_QUOTAS` for the new level, unless `customQuotas` is set. The `customQuotas` JSON field allows per-user overrides that take precedence over trust-level defaults. Both `quotas` and `customQuotas` have admin-only update access.

### System User

The system user (`system@timetiles.internal`) is a reserved account that owns orphaned public data after account deletions. It ensures publicly shared catalogs and datasets remain accessible.

Source: `lib/services/system-user-service.ts`

Configuration:

| Property     | Value                       | Reason                                  |
| ------------ | --------------------------- | --------------------------------------- |
| `email`      | `system@timetiles.internal` | Reserved, not a real email              |
| `isActive`   | `false`                     | Cannot log in                           |
| `trustLevel` | `0` (UNTRUSTED)             | No resource quotas needed               |
| `role`       | `user`                      | No admin privileges                     |
| `password`   | Random 32-byte hex          | Required by Payload auth but never used |

The `SystemUserService` provides `getOrCreateSystemUser()` (idempotent, with in-memory caching of the user ID) and `isSystemUser()` for checks. The `canDeleteUser()` method in the deletion service explicitly prevents deletion of the system user.

## Consequences

- **Anti-enumeration adds email overhead**: Every registration attempt for an existing email sends a notification email. High-volume enumeration attempts would generate many emails, but the strict rate limits (3/min, 20/day per IP) bound this cost.
- **Grace period delays deletion**: The 30-day grace period means account deletion is not immediate. Users who need instant deletion must contact an admin, who can trigger deletion directly via the service.
- **Public data survives deletion**: Transferring public catalogs and datasets to the system user means deleting an account does not remove publicly shared data. This is intentional for data availability but means users cannot fully retract public contributions.
- **No automated trust promotion**: All trust level changes require admin action. A future automated promotion system (based on account age, data quality, etc.) could reduce admin burden.
- **Email change has no re-verification step**: The current implementation updates the email directly without requiring the user to verify the new address. A future improvement could send a verification email to the new address before committing the change.
- **Data exports are stored on disk**: Export ZIP files are written to a local directory (`DATA_EXPORT_DIR` or `.exports`), not object storage. This works for the single-process architecture (ADR 0001) but would need adaptation for distributed deployments.
- **Audit log is append-only by design**: The `audit-log` collection denies all create/update/delete via access control, with records written only through `overrideAccess: true` in the `AuditLogService`. This provides a tamper-resistant audit trail for all sensitive account operations (email changes, password changes, deletions, failed auth attempts). Raw IP addresses are retained for 30 days for forensic use, then cleared by a daily background job while preserving the permanent hash. Corrections require direct database access.
