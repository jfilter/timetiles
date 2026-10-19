# Dependency patches

## payload@3.90.2

### Sessions of overlapping logins

`addSessionToUser` read the user's sessions array at login start and wrote the
whole array back. Two overlapping logins of the same account both read the old
array, and the later write dropped the session the earlier one had added: that
browser then held a valid JWT for a session that no longer existed and was
treated as logged out.

The patch appends the new session with the database adapter's atomic `$push`
instead, the approach of the open upstream pull request payloadcms/payload#18150.
The users collection's `afterLogin` hook removes the user's expired sessions
instead, which cannot drop a session an overlapping login adds. Refresh and logout still rewrite the
whole array and can race a login of the same account in the same way.

Remove this patch only when the unpatched Payload passes:

```sh
make test-ai FILTER=concurrent-login-sessions
```

pnpm applies the patch through `package.json` and the lockfile. Reassess it when
upgrading Payload.
