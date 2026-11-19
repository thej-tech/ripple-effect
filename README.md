# Ripple Effect

Ripple Effect helps teams trace how a disruption moves through a system they model. Ollama recommends dependency weights for human review. NetworkX calculates impact and records the inputs and propagation paths for each run.

## Requirements

- Node.js compatible with the repository's Vite version, npm, Python 3.11+, and uv.
- Ollama and the configured model for AI assessment and commentary.
- SQLite for local use, or a configured PostgreSQL database.

## Local workspace workflow

The application opens at Dashboard. The overview reports counts and recent activity across your accessible workspaces. System Builder saves component details, positions, and dependencies as you edit them. Impact Analysis saves each run and its calculation inputs to History.

### Start locally on Windows

In one PowerShell terminal:

```powershell
cd backend
uv sync --locked
$env:APP_ENV = 'development'
$env:ENABLE_LOCAL_AUTH = 'true'
$env:DATABASE_URL = 'sqlite:///./ripple-local.sqlite3'
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
$env:OLLAMA_MODEL = 'qwen2.5:3b'
uv run alembic upgrade head
uv run python -m app.local_account
uv run uvicorn app.main:app --host 127.0.0.1 --port 8020
```

Run `ollama pull qwen2.5:3b` once if the model is missing. Start the Ollama desktop application or run `ollama serve` if its server is inactive.

An approved workspace-local alternative is documented in [the portable Ollama runbook](docs/runbooks/local-ollama-portable.md). It uses the official standalone Windows runtime with checksum verification, ignored model storage, loopback-only access, and cloud features disabled. The 3B model uses the Qwen Research License; review its non-commercial research/evaluation restrictions before use or redistribution.

In another terminal, substitute the UUID printed by the local-account command:

```powershell
cd frontend
npm ci
$env:RIPPLE_LOCAL_USER_ID = '<printed UUID>'
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8020'
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
```

Open http://127.0.0.1:5180. `VITE_API_BASE_URL` defaults to same-origin requests. The development proxy injects identity and the API checks workspace membership on scoped operations. Keep local authentication and both development servers loopback-only. A production identity provider and its API adapter are still required for production use.

Use a new SQLite file for clean demonstrations. To use an existing database, back it up before running `alembic upgrade head`. The migration chain includes workspace descriptions, dependency assessments, and the new `analysis_explanations` table. Generated commentary is saved separately from immutable calculation inputs. PostgreSQL DDL generation is tested; this does not establish live PostgreSQL compatibility for the latest changes.

### Verify

- Backend from `backend`: `uv run pytest`, `uv run ruff check app tests scripts migrations`, and `uv run ruff format --check app tests scripts migrations`.
- Frontend from `frontend`: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, and `npm run build`.
- For the live browser test, choose a fresh SQLite filename in the backend terminal before migrating and registering the local account. Verify the fresh database has no workspaces. Then run:

```powershell
$env:RIPPLE_RUN_LIVE_E2E = '1'
$env:RIPPLE_E2E_URL = 'http://127.0.0.1:5180'
$env:PLAYWRIGHT_USE_CHROME = '1'
$env:RIPPLE_VERIFY_RESTART = '0'
npm run test:e2e
```

Set `RIPPLE_E2E_MANUAL=1` if testing without Ollama. Use a new isolated database for each acceptance run.

### Restart verification

Before a fresh live acceptance run, optionally set an evidence path inside the ignored backend virtual environment:

```powershell
$env:RIPPLE_PERSISTENCE_BASELINE = Join-Path (Resolve-Path '..\backend\.venv') 'phase4-persistence-baseline.json'
$env:RIPPLE_VERIFY_RESTART = '0'
npm run test:e2e
```

After the run succeeds, stop and restart only the isolated API against the same SQLite file and account. Do not seed, reset, or migrate a different database. Keep the frontend proxy and `RIPPLE_E2E_URL` pointed at that API, retain the evidence path, then run:

```powershell
$env:RIPPLE_VERIFY_RESTART = '1'
npm run test:e2e -- --grep 'externally performed API restart'
```

This verifies the exact saved snapshot, hash, results, approved dependencies, History, and saved commentary after the external restart; it does not restart the API for you. The initial workflow also renames a live component and checks that history remains unchanged. Genuine local Qwen recommendations and generated-commentary restoration were verified with Ollama stopped during the restart check. See the [completed Phase 4 integration report](docs/reports/product-improvement-phase4-integration-complete.md).

### Expo walkthrough

1. Select **Create Workspace**, enter **Demo Infrastructure**, and save.
2. Open **System Builder**. Add **Database**, **Backend API**, and **Frontend Application**. Enter their category, criticality, and descriptions.
3. Drag **Database → Backend API** and **Backend API → Frontend Application**. For each arrow, save the relationship and request an AI assessment. Read the reasoning and approve the recommendation or enter a manual weight. Changes are saved as you go.
4. In **Impact Analysis**, create **Database Outage**, select **Database**, set severity to **90**, and add context. Save the trigger and run the analysis.
5. Expand the direct and indirect results. Follow the stored path and weights. Use **Explain with AI** to discuss uncertainty and potential mitigations.

6. Open **History** and reopen **Database Outage**. Expand a result to load any saved AI commentary without generating it again. Refresh and reopen the run to demonstrate persistence. **Explain with AI** or **Regenerate commentary** explicitly requests new output; a failed regeneration leaves saved text visible.

6. Open **Scenarios**. Choose the **Database Outage** run as the baseline and create a scenario. Add a mitigation intervention to **Backend API**, run the scenario, and compare it with the baseline. Scenario changes never update live records.
7. Open **History** and reopen **Database Outage**. Refresh and open it again to demonstrate persistence.


See [docs/progress.md](docs/progress.md) and the [final Phase 5 report](docs/reports/product-improvement-phase5-polish.md) for current verification and remaining work. Workspace collections and retained paths load all pages. System Builder arranges unsaved components left to right along dependencies, and the saved-run graph distinguishes propagation roles and switches to a vertical layout on narrow screens. Fresh installations, including Compose and the local Kubernetes manifest, start without demo workspaces unless `SEED_DEMO_DATA=true` is set deliberately.

## Project guidance

- [`docs/PROJECT_MANUAL.md`](./docs/PROJECT_MANUAL.md) is the complete project manual: methodology, architecture, flowcharts, engine, AI, edge cases, setup, and future work.
- [`AGENTS.md`](./AGENTS.md) contains persistent coding and safety rules.
- [`docs/progress.md`](./docs/progress.md) is the phase handoff and evidence index.
- [`docs/adr/`](./docs/adr/) records approved design decisions.
- [`docs/viva-notes.md`](./docs/viva-notes.md) distinguishes planned concepts from implemented work.
- [`docs/architecture/deployment.md`](./docs/architecture/deployment.md) summarizes the local and proposed cloud deployment architecture.
