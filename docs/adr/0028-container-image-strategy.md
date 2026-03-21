# ADR 0028: Container Image Strategy

## Status

Accepted

## Context

ADR 0006 established the deployment architecture: a multi-stage Dockerfile that users build locally on the target server. This works but creates friction. Building the Next.js application requires substantial memory (2+ GB) and time (several minutes), Node.js tooling must be available on the host, and build failures on low-resource VPS instances are a recurring support issue. Users who just want to run TimeTiles should not need a build toolchain.

The project needs a distribution strategy that separates image building (a CI concern) from image running (a deployment concern).

## Decision

### Pre-Built Images on GitHub Container Registry

All production images are built in GitHub Actions and published to `ghcr.io/jfilter/timetiles`. Users pull images instead of building them. The `docker-compose.prod.yml` file references `image:` instead of `build:`.

Users who need to customize the build can still use a `docker-compose.override.yml` with the existing `Dockerfile.prod` and build context.

### Two Image Variants

| Variant    | Tag example        | Contents                                             | Target use case                     |
| ---------- | ------------------ | ---------------------------------------------------- | ----------------------------------- |
| Main       | `v1.2.0`, `latest` | Next.js standalone build only (~200-400 MB)          | Production with external PostgreSQL |
| All-in-one | `v1.2.0-allinone`  | PostgreSQL 17 + PostGIS 3.5, Nginx, Node.js, the app | Demos, small teams, personal use    |

The **main image** is the same multi-stage build from ADR 0006, just built in CI rather than on the target server. It contains only the Next.js standalone output and runs as user `nextjs` (UID 1001).

The **all-in-one image** is based on Ubuntu 24.04 and uses supervisord to manage three processes: PostgreSQL, the Next.js application, and Nginx. It exposes ports 80 and 443, with a self-signed certificate generated on first boot. Data is stored in a single volume at `/data` (PostgreSQL data and uploads). This variant trades operational flexibility for deployment simplicity -- it cannot scale horizontally and backup requires `pg_dump` inside the running container.

### Multi-Platform Builds

Both variants are built for `linux/amd64` and `linux/arm64` using Docker Buildx. This supports deployment on both x86 servers and ARM-based instances (AWS Graviton, Oracle Ampere, Apple Silicon for local testing).

### Image Tagging Strategy

| Tag      | When applied           | Stability           |
| -------- | ---------------------- | ------------------- |
| `v1.2.0` | Release tag push       | Immutable           |
| `latest` | Every release tag push | Moves with releases |
| `edge`   | Every push to `main`   | Unstable            |

Semver tags are immutable once pushed. The `latest` tag always points to the most recent release. The `edge` tag tracks the `main` branch for early testing.

All-in-one variants follow the same scheme with an `-allinone` suffix: `v1.2.0-allinone`, `latest-allinone`, `edge-allinone`.

### CI/CD Pipeline

The release workflow (`.github/workflows/release-images.yml`) triggers on `v*` tags and runs three jobs:

1. **Build main image** -- multi-platform build, push with semver + `latest` tags
2. **Build all-in-one image** -- separate Dockerfile, push with suffixed tags
3. **Smoke test** -- pull both images, run the `/api/health` endpoint, fail the release if either image is unhealthy

The `edge` builds trigger on pushes to `main` through a separate workflow or job condition.

### Pull-Based Deployment

The `deploy.sh` workflow changes from build-then-start to pull-then-start:

```bash
./deploy.sh update   # docker compose pull && docker compose up -d
```

Users pin a version via `TIMETILES_VERSION` in their `.env.production` file. The compose file references `ghcr.io/jfilter/timetiles:${TIMETILES_VERSION:-latest}`.

Upgrades are: change the version variable, run `deploy.sh update`. No build step, no Node.js on the host, no memory concerns.

### Bootstrap Script Simplification

With pre-built images, the bootstrap scripts no longer need to install Node.js or pnpm on the host. The scripts that remain focus on security hardening (firewall, SSH, fail2ban) and Docker installation. The clone step only needs the `deployment/` directory for compose files and Nginx configuration.

## Consequences

- **No build toolchain required on target servers**: Eliminates Node.js, pnpm, and memory-intensive builds from the deployment path. Low-resource VPS instances (1 GB RAM) can run TimeTiles.
- **CI becomes the single build environment**: Build reproducibility improves because all users run the same image. Build failures are caught in CI, not on production servers.
- **All-in-one image is a convenience, not the recommended production path**: It bundles three services in one container, which conflicts with container best practices. Documentation must clearly state this trade-off.
- **GHCR availability becomes a deployment dependency**: Users cannot deploy or upgrade without access to `ghcr.io`. Mitigated by the override file for local builds.
- **Multi-platform builds increase CI time**: ARM64 cross-compilation via QEMU is slow. Layer caching and build parallelism are necessary to keep release times reasonable.
- **Supersedes the build-related sections of ADR 0006**: ADR 0006 describes the Dockerfile stages and local build process. Those remain accurate for development, but production deployments now use pre-built images. The container architecture, database configuration, file storage, and health check sections of ADR 0006 are unchanged.
