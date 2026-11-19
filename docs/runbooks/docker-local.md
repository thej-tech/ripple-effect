# Local Docker Runbook

This runbook starts Ripple Effect on Windows using the Docker Engine available
inside Ubuntu WSL. It is for local development, not production deployment.

## Architecture

Compose runs four services on its default private project network:

- `web`: React production build served by unprivileged Nginx on container port
  8080, published only at `127.0.0.1:5173`.
- `api`: FastAPI on container port 8000, published only at `127.0.0.1:8000`.
  Nginx proxies `/api/` to `api:8000`.
- `db`: PostgreSQL on private port 5432. It has a readiness health check,
  restarts unless explicitly stopped, and is not published on the Windows host.
- `ollama`: Ollama on private port 11434. FastAPI uses
  `http://ollama:11434`; this port is not published on the Windows host.

The API waits for healthy PostgreSQL and Ollama services. The web service waits
for API readiness. Ollama's health check proves its server responds, not that
the requested model is installed.

`postgres-data` preserves the existing PostgreSQL volume. `ollama-data` stores
model files at `/root/.ollama`; neither model files nor database files are
included in the application images. Compose uses the versioned Ollama image
`ollama/ollama:0.40.16`.
The official Docker instructions use the `ollama/ollama` image:
<https://docs.ollama.com/docker>.

## Prerequisites and environment

- Docker Engine and Docker Compose available from Ubuntu WSL.
- An open Ubuntu WSL terminal while using the stack. WSL can shut down after the
  last session ends, taking Docker and all four services offline.
- Available disk space for the Ollama image (about 3.4 GB on amd64) and the
  `qwen2.5:3b` model (the model registry lists about 1.9 GB for the quantized
  model).
- A local `.env` file. `.env` is ignored by Git; do not commit it.

From PowerShell at the repository root, copy the example only if no local
environment file exists, then edit it:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Set `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. For an existing
volume, keep the credentials and database name used when it was initialized.
Compose interpolates the password directly into `DATABASE_URL`. Use only URL-unreserved
characters (`A-Z`, `a-z`, `0-9`, `.`, `_`, `~`, `-`) in `POSTGRES_PASSWORD`;
Compose does not percent-encode it. `OLLAMA_BASE_URL` and `OLLAMA_MODEL` have
the values shown in `.env.example` and may be left at those defaults. Keep
`SEED_DEMO_DATA=false` unless you explicitly want the synthetic demo fixtures.

The current Compose configuration enables development local-auth behavior and
binds browser/API ports to loopback. Do not expose these services to a network
or use these settings as a production deployment.

## Validate and build

Run these commands from PowerShell; each executes Compose inside Ubuntu WSL:

```powershell
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker info'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose config --quiet'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose build api web'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose pull ollama'
```

`pull ollama` retrieves the pinned runtime image; it does not start a container
or download the Qwen model.

## Provision Qwen once

Model files are deliberately not downloaded during ordinary Compose startup.
Start Ollama, pull the model into its named volume, and verify it before starting
the application:

```powershell
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose up -d ollama'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose exec ollama ollama pull qwen2.5:3b'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose exec ollama ollama list'
```

The final command should list `qwen2.5:3b`. A healthy Ollama container with an
empty model list is not ready for AI requests. Qwen's model license is the Qwen
Research License; review its terms before use or redistribution:
<https://ollama.com/library/qwen2.5:3b>.

After model verification, start the complete stack:

```powershell
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose up -d --build'
```

CPU inference is the default; no GPU devices or runtime are configured. For
optional NVIDIA acceleration, first install and configure a compatible NVIDIA
driver and Container Toolkit for the WSL/Docker Engine in use, then add
`gpus: all` to the `ollama` service. Do not add that setting on a machine
without a supported GPU runtime. AMD GPU use requires the Ollama `rocm` image
and device access; it is not configured here.

## Verify services and network paths

```powershell
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose ps'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && curl --fail --silent --show-error http://127.0.0.1:8000/api/v1/health/live'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && curl --fail --silent --show-error http://127.0.0.1:8000/api/v1/health/ready'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && curl --fail --silent --show-error http://127.0.0.1:5173/health'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && curl --fail --silent --show-error http://127.0.0.1:5173/api/v1/health/ready'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose exec api python -c "import httpx; r=httpx.get(\"http://ollama:11434/api/tags\", timeout=5); r.raise_for_status(); print([m[\"name\"] for m in r.json().get(\"models\", [])])"'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose exec ollama ollama list'
```

The browser URL is <http://localhost:5173>. API liveness and readiness are
`http://localhost:8000/api/v1/health/live` and
`http://localhost:8000/api/v1/health/ready`. Nginx health is
`http://localhost:5173/health`; the last health command also checks the
Nginx-to-API proxy. Ollama is intentionally not reachable through a host port;
check it from `api` or with `docker compose exec ollama`.

The application has real AI routes:

- `POST /api/v1/dependencies/{dependency_id}/assessment` assesses an existing
  dependency.
- `POST /api/v1/analysis-runs/{run_id}/ai-explanation` takes the existing
  `entity_id` payload for a saved analysis run.

Both require existing tenant-scoped records and authorization. Assessment and
generated explanation calls persist application state. Do not fabricate IDs or
seed data just to produce a passing check; only invoke them when appropriate
records already exist and the resulting write is intended.

## Logs, restart, and stop

```powershell
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose logs --tail=100 db api web ollama'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose logs -f api ollama'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose restart api web'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose stop'
```

`stop` stops services while retaining containers and volumes. `docker compose
start` starts the stopped services again. `docker compose down` removes
containers and the project network but preserves named volumes. Never use
`docker compose down -v`, `docker volume rm`, or prune commands when you need
the existing PostgreSQL data or downloaded model.

## Updating the model

To refresh the `qwen2.5:3b` tag in place, pull it into the existing model
volume and verify it again; no backend image rebuild is needed:

```powershell
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose exec ollama ollama pull qwen2.5:3b'
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose exec ollama ollama list'
```

To select a different installed model, set `OLLAMA_MODEL` in the local `.env`
and recreate the API container so it receives the new environment value:

```powershell
wsl -e bash -lc 'cd /mnt/d/Projects/ripple-effect && docker compose up -d --force-recreate api'
```

## Docker Desktop (optional GUI)

Docker Desktop is optional; the current setup uses Docker Engine from Ubuntu
WSL. If installing Docker Desktop later, use Docker's official Windows
instructions: <https://docs.docker.com/desktop/setup/install/windows-install/>.
The per-user installer is the recommended mode; select the WSL 2 backend, then
use Docker Desktop **Settings > Resources > WSL Integration** to enable the
Ubuntu distro if desired. Open Docker Desktop from the Windows Start menu.

Docker Desktop's engine may be separate from the Docker Engine already used in
Ubuntu WSL. Containers, images, and volumes belong to an engine; do not assume
the GUI will show data from a different engine. Before changing contexts or
enabling integration, inspect `docker context show` and `docker context ls`.
Do not switch engines until you have decided which engine should own this
project's containers and persistent volumes.

## Troubleshooting

- If API logs say it cannot resolve `db`, check `docker compose ps -a` and
  `docker compose logs db`. A stopped DB is unavailable on Compose DNS; start
  the stack with `docker compose up -d` and wait for `db` to become healthy.
- If Nginx returns 502 after an API container replacement, check the API and
  web logs. The Nginx proxy uses Docker's embedded DNS to refresh the API
  address after container IP changes.
- If readiness is 503, inspect database health and the API log. Readiness
  checks the database, not the model.
- If AI requests report that the model was not found, run `ollama list` and
  pull the configured model into the `ollama-data` volume.
- If the Ollama health check fails, inspect `docker compose logs ollama` and
  verify the Engine has enough memory and disk space.
- A database container exiting with code 0 after a fast-shutdown log indicates
  an orderly shutdown request, not by itself a PostgreSQL crash. Check container
  lifecycle events and recent Compose/Engine stop actions before attributing
  the initiator.
