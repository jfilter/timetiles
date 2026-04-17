# ADR 0039: Password Policy Hardening

## Status

Proposed

## Context

TimeTiles currently enforces only a minimum password length of 8 characters in its public flows. The policy is inconsistent across entry points:

- registration enforces `min(8)` at the route layer
- authenticated password change enforces `min(8)` at the route layer
- reset-password UI validates on the client, but the underlying Payload auth flow needs its own authoritative validation

The review identified two gaps:

1. no maximum length, which leaves room for slow-hash abuse and inconsistent handling
2. no compromised-password screening

We need a policy that is stronger than `min(8)`, is enforced consistently across all password-setting paths, and does not create fragile operational dependencies.

## Decision

TimeTiles will adopt a **centralized password policy** enforced server-side for every password set or reset.

### Baseline rules

All new or changed passwords must:

- be at least **12 characters**
- be at most **256 characters**
- not appear in the Have I Been Pwned (HIBP) compromised-password corpus

Existing passwords remain valid until the user changes or resets them.

### Enforcement point

Password policy must be enforced in one shared server-side validator, not duplicated across route schemas. The validator should be invoked from the authoritative password-setting path so it covers:

- self-registration
- authenticated password change
- password reset
- admin-created users when a password is supplied intentionally

Client-side forms should reuse the same exported constants/messages for immediate UX feedback, but client validation is advisory only.

### Compromised-password checks

HIBP integration should use the k-anonymity range API so raw passwords are never sent to the upstream service.

Behavior:

- If HIBP reports a match, reject the password
- If the HIBP request fails or times out, **fail open** and continue with the local policy checks while logging the event for operators

Fail-open is the right trade-off here because password reset and recovery flows should not depend on the availability of a third-party service.

### Policy style

TimeTiles will not require composition rules such as:

- uppercase letters
- digits
- symbols
- periodic forced rotation

Longer passphrases and compromised-password blocking are preferred over brittle composition requirements.

### Hashing compatibility

Payload 3 currently hashes local-auth passwords with PBKDF2, so the maximum-length decision is an operational bound rather than a workaround for bcrypt truncation. The cap exists to bound request cost and prevent pathological inputs, not to reduce entropy.

## Consequences

### Positive

- Password requirements become consistent across registration, reset, and change flows
- The minimum length moves to a materially stronger baseline
- Known-compromised passwords are blocked without sending the full password to a third party
- The policy aligns with modern guidance better than composition-based rules

### Negative

- HIBP lookups add latency to password-setting flows
- A centralized validator introduces one more security-critical shared module that must be well tested
- Some passwords that were previously accepted will now be rejected on change/reset

### Neutral

- Existing users are not forced to rotate passwords immediately
- Route-level Zod schemas can stay lightweight once the shared validator becomes authoritative

## Alternatives Considered

### Keep `min(8)` and add only a maximum length

Rejected. That would address the DoS concern but leave the overall password policy too weak.

### Add composition rules (uppercase, symbol, digit)

Rejected. These rules tend to push users toward predictable patterns without meaningfully improving resistance to real-world attacks.

### Fail closed when HIBP is unavailable

Rejected. Account recovery and password change should not depend on a remote service being reachable.

### Use only a local denylist

Rejected. A local denylist is easier to operate but would be much less effective than the HIBP corpus unless it is continuously maintained.

## Related

- ADR 0002: Security Model
- ADR 0013: Account Management and User Lifecycle
