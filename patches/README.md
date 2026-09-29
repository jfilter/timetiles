# Dependency patches

## payload@3.86.0

The patch changes two Payload files.

### Sessions of overlapping logins

`addSessionToUser` read the user's sessions array at login start and wrote the
whole array back. Two overlapping logins of the same account both read the old
array, and the later write dropped the session the earlier one had added: that
browser then held a valid JWT for a session that no longer existed and was
treated as logged out.

The patch appends the new session with the database adapter's atomic `$push`
instead, the approach of the open upstream pull request payloadcms/payload#18150.
Expired sessions are therefore no longer pruned on login, only on token
refresh; a stale row per login is harmless. Refresh and logout still rewrite the
whole array and can race a login of the same account in the same way.

Remove this part only when the unpatched Payload passes:

```sh
make test-ai FILTER=concurrent-login-sessions
```

### Prototype-named JSON keys

`deepCopyObjectSimple` copies JSON fields with ordinary property assignment.
For an own `__proto__` key, that invokes the inherited setter instead of creating
a data property. Payload's local create and update paths use this helper, so an
event update can remove a field that the import pipeline stored successfully.

The patch creates enumerable, writable, configurable own data properties while
preserving the helper's recursive copying and undefined-value handling. It does
not replace Payload's hooks, validation, transactions, or event versioning.

Remove this part only when the unpatched replacement passes the
`preserves prototype-named imported values when updating event data` regression:

```sh
make test-ai FILTER=events-range-filter.test
```

Run the full test suite when changing this shared Payload helper.

pnpm applies the patch through `package.json` and the lockfile. Reassess both
parts when upgrading Payload.
