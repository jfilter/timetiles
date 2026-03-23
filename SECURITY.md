# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |

Only the latest release on `main` receives security updates.

## Reporting a Vulnerability

**Do not open a public issue.** Instead, email [hi@timetiles.io](mailto:hi@timetiles.io) with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### What to expect

- Acknowledgment within 48 hours
- Detailed response within 7 days
- A fix timeline based on severity
- Credit in the release notes (unless you prefer anonymity)

### Scope

The following are in scope:

- The TimeTiles web application and API
- Authentication and access control
- File upload and import processing
- Geocoding and data handling
- Scraper container isolation

Out of scope:

- Vulnerabilities in upstream dependencies (report those to the respective maintainers)
- Denial of service attacks
- Social engineering

## Responsible Disclosure

Please give us reasonable time to address the issue before any public disclosure. Do not test against production instances you do not own, and do not access or modify other users' data.
