# Dependency patches

## payload@3.92.0

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

### Access to document locks

Payload adds the `payload-locked-documents` collection itself, with every
operation open to any logged-in user and no override. A regular account could
therefore list which editor is editing which document and create or delete
locks, blocking editors out of documents.

The patch lets the root config's server-only `custom.lockedDocumentsAccess`
replace that default; `lib/config/payload-config-factory.ts` sets it to editors
and admins. The admin UI takes locks as the logged-in user, so editors keep
working. Remove this part only when upstream offers its own override and this
passes against it:

```sh
make test-ai FILTER=locked-documents-access
```

pnpm applies the patch through `package.json` and the lockfile. Reassess it when
upgrading Payload.

## nextra-theme-docs@4.6.1

### Layout props under zod 4.4 and later

`<Layout>` takes `children` out of its props and validates the rest against
`LayoutPropsSchema`, which declares `children` as required. Up to zod 4.3 a
missing key passed a `z.custom()` check that accepts `undefined`; from zod 4.4
it fails with "expected nonoptional, received undefined", and every docs page
fails to prerender.

The patch marks `children` optional in that schema. Remove it only when the
unpatched theme passes a clean docs build:

```sh
rm -rf apps/docs/.next && pnpm --filter docs build
```

Reassess it when upgrading nextra.
