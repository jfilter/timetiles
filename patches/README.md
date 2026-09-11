# Dependency patches

## payload@3.86.0

`deepCopyObjectSimple` copies JSON fields with ordinary property assignment.
For an own `__proto__` key, that invokes the inherited setter instead of creating
a data property. Payload's local create and update paths use this helper, so an
event update can remove a field that the import pipeline stored successfully.

The patch creates enumerable, writable, configurable own data properties while
preserving the helper's recursive copying and undefined-value handling. It does
not replace Payload's hooks, validation, transactions, or event versioning.

pnpm applies the patch through `package.json` and the lockfile. Reassess it when
upgrading Payload; remove it only when the unpatched replacement passes the
`preserves prototype-named imported values when updating event data` regression:

```sh
make test-ai FILTER=events-range-filter.test
```

Run the full test suite when changing this shared Payload helper.
