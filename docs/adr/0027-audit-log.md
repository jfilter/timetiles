# ADR 0027: Audit Log System

## Status

Accepted

## Context

TimeTiles is a multi-tenant platform where users manage sensitive data (catalogs, datasets, events) and perform security-critical operations (password changes, email changes, account deletion). Administrators change user trust levels, toggle feature flags, and override import job states. Without a tamper-resistant record of these actions, it is difficult to investigate security incidents, detect privilege abuse, or satisfy compliance requirements.

ADR 0013 introduced the audit log alongside account management. This ADR documents the full audit log system: its collection schema, service layer, PII handling, retention policy, and integration points across the codebase.

## Decision

### Collection: `audit-log`

The `audit-log` collection stores immutable records of sensitive actions. It is defined in `lib/collections/audit-log.ts`.

**Access control** enforces immutability at the API level:

| Operation | Access     | Rationale                             |
| --------- | ---------- | ------------------------------------- |
| `read`    | Admin only | Only admins can view audit logs       |
| `create`  | `false`    | No creation via REST or local API     |
| `update`  | `false`    | No modification via REST or local API |
| `delete`  | `false`    | No deletion via REST or local API     |

Records are created exclusively through `payload.create()` with `overrideAccess: true` inside the `AuditLogService`. This means no user, including admins, can create, modify, or delete audit entries through the Payload dashboard or REST API. Corrections require direct database access.

Versioning is disabled (`versions: false`) because audit entries are append-only and never change.

**Fields:**

| Field           | Type         | Required | Indexed | Description                                                      |
| --------------- | ------------ | -------- | ------- | ---------------------------------------------------------------- |
| `action`        | text         | Yes      | Yes     | Dotted action type (e.g. `account.email_changed`)                |
| `userId`        | number       | Yes      | Yes     | The user this action pertains to                                 |
| `userEmailHash` | text         | Yes      | No      | SHA-256 hash of the user's email at the time of the action       |
| `performedBy`   | relationship | No       | No      | Admin who initiated the action (null for self-initiated actions) |
| `timestamp`     | date         | Yes      | Yes     | When the action occurred                                         |
| `ipAddress`     | text         | No       | No      | Raw client IP (cleared after 30 days by background job)          |
| `ipAddressHash` | text         | No       | No      | SHA-256 hash of the IP address (permanent, for correlation)      |
| `details`       | json         | No       | No      | Action-specific structured data                                  |

All fields are marked `readOnly` in the admin panel to reinforce immutability in the dashboard UI.

### Action Types: 5 Domains, 20 Actions

Actions follow the convention `{domain}.{event_name}`. The `AUDIT_ACTIONS` constant in `lib/services/audit-log-service.ts` provides type-safe access to all action strings.

**Account actions** (recorded from API routes in `app/api/users/`):

| Action                           | Trigger                                   | Details                                           |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| `account.email_changed`          | User changes their email                  | Old and new email hashes                          |
| `account.password_changed`       | User changes their password               | None                                              |
| `account.deletion_scheduled`     | User requests account deletion            | Scheduled deletion date                           |
| `account.deletion_cancelled`     | User cancels pending deletion             | None                                              |
| `account.deletion_executed`      | Background job executes deletion          | Deletion type, data transferred/deleted counts    |
| `account.password_verify_failed` | Failed password check during sensitive op | Context (e.g. `email_change`, `account_deletion`) |

**Admin actions** (recorded from the `users` collection `afterChange` hook):

| Action                        | Trigger                                         | Details                              |
| ----------------------------- | ----------------------------------------------- | ------------------------------------ |
| `admin.trust_level_changed`   | Admin changes a user's trust level              | Previous and new trust level         |
| `admin.role_changed`          | Admin changes a user's role                     | Previous and new role                |
| `admin.user_activated`        | Admin re-activates a user                       | Previous and new `isActive` value    |
| `admin.user_deactivated`      | Admin deactivates a user                        | Previous and new `isActive` value    |
| `admin.custom_quotas_changed` | Admin sets per-user quota overrides             | Previous and new `customQuotas` JSON |
| `admin.quota_overridden`      | Admin changes quotas without trust level change | Previous and new quota values        |

**Data actions** (recorded from collection `afterChange` hooks and the deletion service):

| Action                               | Trigger                             | Details                                 |
| ------------------------------------ | ----------------------------------- | --------------------------------------- |
| `data.catalog_visibility_changed`    | Catalog `isPublic` toggled          | Catalog ID/name, previous and new value |
| `data.dataset_visibility_changed`    | Dataset `isPublic` toggled          | Dataset ID/name, previous and new value |
| `data.catalog_ownership_transferred` | Catalog owner changed (or deletion) | Catalog ID, previous and new owner IDs  |
| `data.dataset_ownership_transferred` | Dataset owner changed (or deletion) | Dataset ID, previous and new owner IDs  |

**System actions** (recorded from the `settings` global `afterChange` hook):

| Action                        | Trigger                                      | Details                           |
| ----------------------------- | -------------------------------------------- | --------------------------------- |
| `system.feature_flag_changed` | Admin toggles a feature flag                 | Changed flags with old/new values |
| `system.settings_changed`     | Admin changes geocoding or newsletter config | Which config sections changed     |

**Import actions** (recorded from collection `afterChange` hooks):

| Action                                   | Trigger                                          | Details                               |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `import.job_stage_override`              | Admin overrides a completed or failed import job | Job ID, from/to stages, override type |
| `import.scheduled_import_admin_modified` | Admin modifies another user's scheduled import   | Schedule ID/name, what changed        |

### AuditLogService Design

The service is defined in `lib/services/audit-log-service.ts` and exports two functions: `auditLog()` and `auditFieldChanges()`.

**`auditLog(payload, entry, options?)`** creates a single audit entry. Key design choices:

- **Non-throwing**: The function wraps all logic in a try/catch and logs errors instead of throwing. Audit logging must never prevent the primary operation from completing.
- **`overrideAccess: true`**: Bypasses the collection's all-deny access control, since this is the only authorized write path.
- **Automatic PII hashing**: The caller provides the raw email and IP address. The service hashes them via `hashEmail()` and `hashIpAddress()` (SHA-256) before storage. The raw email is never stored; the raw IP is stored temporarily (see retention below).
- **Transaction support**: An optional `req` parameter allows the audit entry to participate in an existing Payload transaction. The account deletion service uses this to ensure the audit record is rolled back if the deletion fails.

**`auditFieldChanges(payload, args, fields)`** detects field-level diffs in Payload `afterChange` hooks and fires one audit entry per changed field. It accepts an array of `FieldAuditConfig` objects, each mapping a field path to an action type. This utility eliminates repetitive diff-checking boilerplate in hooks.

Each config can provide a custom `detailsFn` to transform the old/new values into the `details` payload. If omitted, the default records `{ previousValue, newValue }`.

The function uses `getByPath()` for nested field access and a JSON-based deep equality check. All resulting audit entries fire concurrently via `Promise.all()`.

Source: `lib/services/audit-log-service.ts`

### `performedBy` Field

The `performedBy` relationship field records which admin initiated an action on behalf of another user. It is set only when the acting user differs from the target user:

```typescript
const performedBy = req.user?.id === targetUserId ? undefined : req.user?.id;
```

This means:

- Self-initiated actions (user changes their own password) have `performedBy: null`.
- Admin actions on other users (trust level change, deactivation) record the admin's ID.
- System-initiated actions (background job executing deletion) may pass the scheduling admin's ID or leave it null.

### PII Handling and Hashing

Two types of PII appear in audit entries: email addresses and IP addresses.

**Email addresses**: Never stored in raw form. The `userEmailHash` field stores a SHA-256 hash of the lowercased, trimmed email. This allows correlation across entries (same user = same hash) without exposing the email. When an email changes, the `details` field stores hashes of both old and new emails.

**IP addresses**: Stored in two forms:

- `ipAddress`: Raw IP for forensic use during the retention window. Only available from API route handlers (Payload hooks do not have access to the client IP).
- `ipAddressHash`: Permanent SHA-256 hash for long-term correlation across entries.

Source: `lib/security/hash.ts`

### IP Address Retention and Cleanup

Raw IP addresses are retained for 30 days, then cleared by the `audit-log-ip-cleanup` background job.

The job runs daily at 04:00 UTC (`0 4 * * *`) on the `maintenance` queue with 2 retries. It:

1. Finds audit entries older than 30 days that still have a non-null `ipAddress`.
2. Sets `ipAddress` to `null` on each entry via `overrideAccess: true` (this is the only permitted update to audit records).
3. Processes up to 500 entries per run to bound execution time.
4. Leaves `ipAddressHash` intact for permanent correlation.

This is the one exception to the "no updates" rule for audit entries. The cleanup job uses `overrideAccess: true` to bypass the deny-all update access control, but it only ever nulls the `ipAddress` field.

Source: `lib/jobs/handlers/audit-log-ip-cleanup-job.ts`

### Integration Points

Audit logging is integrated at four levels:

**API routes** (direct `auditLog()` calls): Account routes (`change-email`, `change-password`, `schedule-deletion`, `cancel-deletion`) call `auditLog()` directly after the primary operation succeeds. The `verifyPasswordWithAudit()` helper in `lib/api/auth-helpers.ts` wraps password verification and automatically logs `password_verify_failed` on failure.

**Collection `afterChange` hooks** (via `auditFieldChanges()` and direct calls): The `users` collection hook uses `auditFieldChanges()` to detect trust level, role, and custom quota changes. It uses direct `auditLog()` calls for `isActive` toggling and manual quota overrides. The `catalogs` and `datasets` hooks audit visibility and ownership changes.

**Global `afterChange` hooks**: The `settings` global hook detects feature flag changes and configuration changes, logging each category separately.

**Account deletion service** (transactional): The `AccountDeletionService.executeDeletion()` method calls `auditLog()` within a Payload transaction, passing the transaction's `req` object. This ensures the `deletion_executed` audit entry is atomically committed or rolled back with the deletion itself. The service also records `catalog_ownership_transferred` and `dataset_ownership_transferred` entries for each public resource transferred to the system user.

### Querying and Indexing

Three fields are indexed for efficient querying: `action`, `userId`, and `timestamp`. Common query patterns supported by these indexes:

- All actions for a specific user: filter on `userId`
- All actions of a specific type: filter on `action`
- Actions within a time range: filter on `timestamp`
- Actions for a user within a time range: filter on `userId` + `timestamp`

The `userEmailHash` field supports correlation when the user ID is unknown (e.g., after account deletion anonymizes the user record).

## Consequences

- **Tamper resistance via access control, not encryption**: The immutability guarantee comes from Payload's access control layer, not cryptographic signing. Anyone with direct database access can modify records. This is acceptable for the single-process architecture (ADR 0001) where the database is a trusted component.
- **Non-throwing design trades completeness for reliability**: If audit logging fails (database error, serialization issue), the primary operation still succeeds. Failed audit attempts are logged via the application logger, but the audit trail will have gaps. This is the right trade-off: a password change should never fail because the audit entry could not be written.
- **IP addresses are only available from API routes**: Payload hooks do not receive the client IP address. Actions triggered through the Payload dashboard or local API (admin trust level changes, feature flag toggles) record no IP address. This is a known limitation.
- **30-day IP retention is a fixed constant**: The retention period is defined as `IP_RETENTION_DAYS = 30` in the cleanup job, not as a configurable setting. Changing it requires a code change.
- **Batch size limits cleanup throughput**: The IP cleanup job processes at most 500 entries per run. On instances with high audit volume, entries may retain raw IPs slightly beyond 30 days until subsequent runs clear the backlog.
- **Email hashes are irreversible but not salted**: SHA-256 hashes without a salt mean the same email always produces the same hash, which enables correlation. However, this also means an attacker with the hash and a known email list could confirm whether an email appears in the audit log. The threat is mitigated by admin-only read access.
- **ADR 0013 remains the canonical reference for account lifecycle**: This ADR documents the audit system itself. ADR 0013 documents how audit logging integrates with account management (deletion, registration, credential changes). The two are complementary.
