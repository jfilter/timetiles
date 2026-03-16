# TimeScrape Runner Setup Guide

This guide walks through deploying the TimeScrape runner, the service that executes scraper code inside hardened Podman containers for TimeTiles.

## Prerequisites

- **Podman** (rootless mode) -- version 4.0 or later
- **Node.js** 24 or later (for running the service outside a container)
- **Git** (for cloning scraper repositories at execution time)

## 1. Install Podman (Rootless)

### macOS

```bash
brew install podman
podman machine init
podman machine start
```

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y podman
```

### Verify rootless mode

```bash
podman info --format '{{.Host.Security.Rootless}}'
```

This must return `true`. If it does not, consult the [Podman rootless tutorial](https://github.com/containers/podman/blob/main/docs/tutorials/rootless_tutorial.md).

## 2. Build Base Images

The runner spawns containers from two base images. Build them from the `images/` directory inside `apps/scraper/`.

```bash
cd apps/scraper

# Python runtime (requests, beautifulsoup4, lxml, pandas, cssselect)
podman build -t timescrape-python images/python/

# Node.js runtime (cheerio, axios)
podman build -t timescrape-node images/node/
```

The image names `timescrape-python` and `timescrape-node` are expected by the runner. Do not change the tags unless you also change the runtime-to-image mapping in the runner code.

To verify:

```bash
podman images | grep timescrape
```

You should see both `timescrape-python` and `timescrape-node`.

## 3. Create the Sandbox Network

Scraper containers run on an isolated Podman network called `scraper-sandbox`. This network allows internet access (so scrapers can fetch web pages) but keeps containers separated from internal services such as PostgreSQL and the TimeTiles web app.

```bash
podman network create scraper-sandbox
```

Verify:

```bash
podman network ls | grep scraper-sandbox
```

**Why a separate network?** Without it, scraper containers could reach any service on the host or the default Podman network -- including the database. The `scraper-sandbox` network combined with `--dns=1.1.1.1` (set by the runner) prevents DNS-based discovery of internal services.

## 4. Environment Variables

Create an `.env` file in the `apps/scraper/` directory. The only required variable is `SCRAPER_API_KEY`.

```bash
# .env -- TimeScrape runner configuration

# REQUIRED: Shared secret for API authentication (minimum 16 characters).
# Must match the SCRAPER_API_KEY value in the TimeTiles .env.
SCRAPER_API_KEY=your-secret-key-at-least-16-chars

# HTTP server port (default: 4000)
SCRAPER_PORT=4000

# Maximum simultaneous container runs (default: 3)
SCRAPER_MAX_CONCURRENT=3

# Default timeout per run in seconds (default: 300)
SCRAPER_DEFAULT_TIMEOUT=300

# Default memory limit per container in MB (default: 512)
SCRAPER_DEFAULT_MEMORY=512

# Maximum Git repo clone size in MB (default: 50)
SCRAPER_MAX_REPO_SIZE_MB=50

# Maximum CSV output file size in MB (default: 100)
SCRAPER_MAX_OUTPUT_SIZE_MB=100

# Temp directory for run workspaces (default: /tmp/timescrape)
SCRAPER_DATA_DIR=/tmp/timescrape
```

Generate a strong API key:

```bash
openssl rand -hex 32
```

## 5. Run the Service

### Development

From the monorepo root:

```bash
pnpm --filter scraper dev
```

The server starts on the port specified by `SCRAPER_PORT` (default 4000).

### Production (container)

Build and run the runner as a Podman container using the Dockerfile at `apps/scraper/Dockerfile`:

```bash
cd apps/scraper

podman build -t timescrape-runner .

podman run -d \
  --name timescrape-runner \
  -p 4000:4000 \
  --env-file .env \
  -v /run/user/$(id -u)/podman/podman.sock:/run/podman/podman.sock \
  timescrape-runner
```

**Note:** The runner itself needs access to the Podman socket so it can spawn scraper containers. When running the runner inside a container, mount the rootless Podman socket as shown above. When running the runner directly on the host (outside a container), no socket mount is needed -- the runner invokes `podman` as a CLI command.

Verify the service is running:

```bash
curl http://localhost:4000/health
```

You should receive a JSON response with `"status": "ok"`.

## 6. Connect to TimeTiles

Add two variables to the TimeTiles `.env` file (`apps/web/.env`):

```bash
# URL where TimeTiles can reach the runner
SCRAPER_RUNNER_URL=http://localhost:4000

# Must match the runner's SCRAPER_API_KEY exactly
SCRAPER_API_KEY=your-secret-key-at-least-16-chars
```

Then enable the feature flag:

1. Log in to TimeTiles as an admin.
2. Go to **Settings** (the global settings page in the Payload dashboard).
3. Enable **enableScrapers**.

Without this flag, users cannot create scraper repos and scraper jobs will not execute.

## 7. Security Considerations

### Podman rootless vs Docker socket

The runner is designed for Podman rootless mode specifically to avoid the Docker socket attack surface. Docker's daemon runs as root, and access to `/var/run/docker.sock` grants full root control of the host. Podman has no daemon -- containers run as unprivileged user processes.

Do not run this service with Docker unless you fully understand the security implications.

### Container hardening

Every scraper container is launched with multiple layers of defense:

| Protection                     | Flag                                                      |
| ------------------------------ | --------------------------------------------------------- |
| Drop all capabilities          | `--cap-drop=ALL`                                          |
| Block privilege escalation     | `--security-opt=no-new-privileges`                        |
| Custom seccomp profile         | `--security-opt=seccomp=...` (restricts to ~100 syscalls) |
| Read-only filesystem           | `--read-only`                                             |
| Writable tmp with no execution | `--tmpfs=/tmp:rw,size=64m,noexec`                         |
| Process limit                  | `--pids-limit=256`                                        |
| Memory and CPU limits          | `--memory` and `--cpus` per run                           |
| User namespace remapping       | `--userns=auto`                                           |
| Network isolation              | `--network=scraper-sandbox` with external DNS only        |

Code is mounted read-only at `/scraper`. The only writable location for output is `/output`. See ADR 0015 for the full rationale.

### API key rotation

The `SCRAPER_API_KEY` is the sole authentication mechanism between TimeTiles and the runner. If compromised, an attacker could submit arbitrary code for container execution (within the hardening limits above).

To rotate the key:

1. Generate a new key: `openssl rand -hex 32`
2. Update `SCRAPER_API_KEY` in both `apps/scraper/.env` and `apps/web/.env`.
3. Restart both the runner and the TimeTiles web app.

Rotate the key periodically and whenever you suspect it may have been exposed.

## Troubleshooting

| Problem                                    | Solution                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `podman: command not found`                | Install Podman (see section 1)                                                            |
| Rootless check returns `false`             | Run `podman machine init && podman machine start` (macOS) or consult Podman rootless docs |
| Health check returns connection refused    | Verify `SCRAPER_PORT` and that the service is running                                     |
| Scraper runs fail with "image not found"   | Build the base images (see section 2): `podman build -t timescrape-python images/python/` |
| Scraper runs fail with "network not found" | Create the sandbox network: `podman network create scraper-sandbox`                       |
| TimeTiles cannot reach the runner          | Verify `SCRAPER_RUNNER_URL` is correct and the runner port is accessible                  |
| "API key must be at least 16 characters"   | Set `SCRAPER_API_KEY` to a string of 16+ characters                                       |
